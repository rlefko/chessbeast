"""
Concurrency-focused tests for the Stockfish engine pool.

Uses the shared mock_simple_engine fixture (services/conftest.py) so no real
Stockfish binary is required. All timeouts are kept short (0.05-0.2s) to keep
the whole file fast.
"""

import threading
import time
from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest

from stockfish_service.config import EngineConfig, PoolConfig
from stockfish_service.pool import EnginePool, PoolExhaustedError, PoolShutdownError

POOL_SIZE = 2


def _pause(seconds: float) -> None:
    """Sleep without time.sleep (which is no-op patched while fast_pool is active)."""
    threading.Event().wait(seconds)


def _fast_shutdown(pool: EnginePool, mock_engine: MagicMock) -> None:
    """Shut the pool down quickly by marking the mocked engine process as exited.

    StockfishEngine.stop() polls transport.get_returncode() until the process
    exits; flipping the mock's return code lets that loop break immediately.
    """
    mock_engine.protocol.transport.get_returncode.return_value = 1
    pool.shutdown(timeout=0.01)


@pytest.fixture
def fast_pool(
    mock_simple_engine: MagicMock,
    pool_config: PoolConfig,
    engine_config: EngineConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[EnginePool]:
    """Start a size-2 pool of mocked engines with the new_game() sleep disabled.

    engine.new_game() sleeps 10ms per release; with 400 release cycles that
    alone would exceed the runtime budget, so time.sleep is patched to a no-op.
    (stockfish_service.engine references the global time module, so this
    patches time.sleep for the duration of the test; tests use _pause instead.)
    """
    monkeypatch.setattr("stockfish_service.engine.time.sleep", lambda _seconds: None)

    # Materialize mock children before worker threads race to create them.
    _ = mock_simple_engine.ping
    _ = mock_simple_engine.protocol.send_line

    pool_config.size = POOL_SIZE
    pool_config.acquire_timeout = 0.2
    pool = EnginePool(pool_config, engine_config)
    pool.start()
    yield pool
    _fast_shutdown(pool, mock_simple_engine)


def _run_stress(
    pool: EnginePool, num_threads: int, cycles: int
) -> tuple[list[str], int, int, list[Exception]]:
    """Run acquire/release cycles across threads with lock-guarded checkout tracking.

    Returns (violations, max_concurrent, completed_cycles, worker_errors).
    """
    lock = threading.Lock()
    in_use: set[int] = set()
    violations: list[str] = []
    errors: list[Exception] = []
    completed = 0
    max_concurrent = 0

    def worker() -> None:
        nonlocal completed, max_concurrent
        try:
            for _ in range(cycles):
                engine = pool.acquire(timeout=2.0)
                with lock:
                    if id(engine) in in_use:
                        violations.append(f"double checkout of engine {id(engine):#x}")
                    in_use.add(id(engine))
                    max_concurrent = max(max_concurrent, len(in_use))
                # Simulate a little work while holding the engine
                engine.is_alive()
                with lock:
                    in_use.discard(id(engine))
                pool.release(engine)
                with lock:
                    completed += 1
        except Exception as exc:  # noqa: BLE001 - surfaced via assertion in the test
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(num_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10.0)

    return violations, max_concurrent, completed, errors


class TestPoolStress:
    """Heavy acquire/release cycling against a small pool."""

    def test_no_double_checkout_under_contention(self, fast_pool: EnginePool) -> None:
        """8 threads x 50 cycles against 2 engines: no engine is handed out twice."""
        violations, _, completed, errors = _run_stress(fast_pool, num_threads=8, cycles=50)

        assert errors == [], f"Worker errors: {errors}"
        assert violations == []
        assert completed == 8 * 50

    def test_pool_size_never_exceeded_under_contention(self, fast_pool: EnginePool) -> None:
        """Concurrent checkouts never exceed the configured pool size."""
        violations, max_concurrent, completed, errors = _run_stress(
            fast_pool, num_threads=8, cycles=50
        )

        assert errors == [], f"Worker errors: {errors}"
        assert violations == []
        assert 0 < max_concurrent <= POOL_SIZE
        assert completed == 8 * 50


class TestPoolExhaustion:
    """Acquire behavior when every engine is checked out."""

    def test_acquire_times_out_when_all_engines_held(self, fast_pool: EnginePool) -> None:
        """acquire() raises PoolExhaustedError after roughly acquire_timeout."""
        first = fast_pool.acquire()
        second = fast_pool.acquire()

        start = time.monotonic()
        with pytest.raises(PoolExhaustedError, match="timeout"):
            fast_pool.acquire(timeout=0.05)
        elapsed = time.monotonic() - start

        assert elapsed >= 0.05
        assert elapsed < 1.0  # generous upper bound for slow CI

        fast_pool.release(first)
        fast_pool.release(second)

    def test_all_blocked_threads_raise_when_exhausted(self, fast_pool: EnginePool) -> None:
        """Every thread blocked on an exhausted pool gets PoolExhaustedError."""
        first = fast_pool.acquire()
        second = fast_pool.acquire()

        results: list[BaseException | None] = []
        lock = threading.Lock()

        def try_acquire() -> None:
            try:
                fast_pool.acquire(timeout=0.05)
                with lock:
                    results.append(None)
            except BaseException as exc:  # noqa: BLE001 - asserted below
                with lock:
                    results.append(exc)

        threads = [threading.Thread(target=try_acquire) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=2.0)

        assert len(results) == 4
        assert all(isinstance(r, PoolExhaustedError) for r in results), results

        fast_pool.release(first)
        fast_pool.release(second)

    def test_blocked_acquire_succeeds_when_engine_released(self, fast_pool: EnginePool) -> None:
        """A blocked acquire() wakes up and receives the engine another thread releases."""
        first = fast_pool.acquire()
        second = fast_pool.acquire()

        acquired: list[object] = []

        def blocked_acquire() -> None:
            acquired.append(fast_pool.acquire(timeout=1.0))

        waiter = threading.Thread(target=blocked_acquire)
        waiter.start()
        _pause(0.05)  # let the waiter block on the empty queue
        fast_pool.release(first)
        waiter.join(timeout=2.0)

        assert not waiter.is_alive(), "blocked acquire never completed"
        assert acquired == [first]

        fast_pool.release(second)
        fast_pool.release(first)


class TestPoolShutdownSemantics:
    """Acquire/release behavior around shutdown."""

    def test_release_after_shutdown_does_not_raise(
        self, fast_pool: EnginePool, mock_simple_engine: MagicMock
    ) -> None:
        """Releasing a held engine after shutdown stops it instead of raising."""
        engine = fast_pool.acquire()
        _fast_shutdown(fast_pool, mock_simple_engine)

        fast_pool.release(engine)  # Must not raise

        assert fast_pool.is_shutdown
        mock_simple_engine.quit.assert_called()

    def test_release_of_all_held_engines_after_shutdown(
        self, fast_pool: EnginePool, mock_simple_engine: MagicMock
    ) -> None:
        """Shutting down while every engine is checked out still allows releases."""
        first = fast_pool.acquire()
        second = fast_pool.acquire()
        _fast_shutdown(fast_pool, mock_simple_engine)

        fast_pool.release(first)  # Must not raise
        fast_pool.release(second)  # Must not raise

        assert fast_pool.is_shutdown
        assert not fast_pool.is_started

    def test_acquire_after_shutdown_raises(
        self, fast_pool: EnginePool, mock_simple_engine: MagicMock
    ) -> None:
        """acquire() after shutdown raises PoolShutdownError."""
        _fast_shutdown(fast_pool, mock_simple_engine)

        with pytest.raises(PoolShutdownError, match="shutting down"):
            fast_pool.acquire()

    def test_blocked_acquire_during_shutdown_times_out_as_exhausted(
        self, fast_pool: EnginePool, mock_simple_engine: MagicMock
    ) -> None:
        """A thread already blocked in acquire() when shutdown happens times out.

        Documents current behavior; arguably a bug: shutdown does not wake
        blocked acquirers, so they surface PoolExhaustedError after their
        timeout instead of a prompt PoolShutdownError.
        """
        first = fast_pool.acquire()
        second = fast_pool.acquire()

        outcome: list[BaseException | None] = []

        def blocked_acquire() -> None:
            try:
                fast_pool.acquire(timeout=0.2)
                outcome.append(None)
            except BaseException as exc:  # noqa: BLE001 - asserted below
                outcome.append(exc)

        waiter = threading.Thread(target=blocked_acquire)
        waiter.start()
        _pause(0.05)  # let the waiter block
        _fast_shutdown(fast_pool, mock_simple_engine)
        waiter.join(timeout=2.0)

        assert len(outcome) == 1
        assert isinstance(outcome[0], PoolExhaustedError)

        fast_pool.release(first)
        fast_pool.release(second)


class TestPoolDeadEngineHandling:
    """Restart path when an acquired engine has died."""

    def test_acquire_restarts_dead_engine(
        self, fast_pool: EnginePool, mock_simple_engine: MagicMock
    ) -> None:
        """Acquiring an engine whose process died triggers an in-place restart."""
        # Simulate process death: transport reports an exit code
        mock_simple_engine.protocol.transport.get_returncode.return_value = 1

        engine = fast_pool.acquire()

        assert engine is not None
        # The restart path stops the dead engine before starting a fresh one
        mock_simple_engine.quit.assert_called()
        assert engine.version == "Stockfish 16 Mock"

    def test_concurrent_context_manager_returns_all_engines(self, fast_pool: EnginePool) -> None:
        """After concurrent context-manager use, all engines are back in the pool."""
        errors: list[Exception] = []

        def worker() -> None:
            try:
                for _ in range(10):
                    with fast_pool.engine(timeout=2.0) as engine:
                        engine.is_alive()
            except Exception as exc:  # noqa: BLE001 - surfaced via assertion below
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)

        assert errors == [], f"Worker errors: {errors}"
        health = fast_pool.health_check()
        assert health["available"] == POOL_SIZE
        assert health["total"] == POOL_SIZE
