"""
Unit tests for the Stockfish engine pool.
"""

import threading
import time
from unittest.mock import MagicMock

import pytest

from stockfish_service.config import EngineConfig, PoolConfig
from stockfish_service.engine import EngineError, StockfishEngine
from stockfish_service.pool import EnginePool, PoolExhaustedError, PoolShutdownError


class TestEnginePoolInit:
    """Tests for pool initialization."""

    def test_init_with_defaults(self) -> None:
        """Pool can be created with default config."""
        pool = EnginePool()
        assert pool.size == 4  # Default pool size
        assert not pool.is_started
        assert not pool.is_shutdown

    def test_init_with_custom_config(
        self, pool_config: PoolConfig, engine_config: EngineConfig
    ) -> None:
        """Pool can be created with custom config."""
        pool = EnginePool(pool_config, engine_config)
        assert pool.size == pool_config.size


class TestEnginePoolStart:
    """Tests for pool startup."""

    def test_start_success(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Pool starts all engines successfully."""
        pool_config.size = 2
        pool = EnginePool(pool_config, engine_config)

        pool.start()

        assert pool.is_started
        health = pool.health_check()
        assert health["total"] == 2
        assert health["available"] == 2

        pool.shutdown()

    def test_start_already_started(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Starting already started pool is safe."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        # Should not raise
        pool.start()

        assert pool.is_started
        pool.shutdown()

    def test_start_after_shutdown(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Cannot start pool after shutdown."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()
        pool.shutdown()

        with pytest.raises(PoolShutdownError):
            pool.start()

    def test_start_engine_failure_cleanup(
        self, monkeypatch, pool_config: PoolConfig, engine_config: EngineConfig
    ) -> None:
        """Pool cleans up if engine startup fails."""
        import chess.engine

        call_count = 0

        def mock_popen(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise FileNotFoundError("stockfish not found")
            mock = MagicMock()
            mock.id = {"name": "Mock"}
            mock.protocol.returncode = None
            return mock

        monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", mock_popen)

        pool_config.size = 3
        pool = EnginePool(pool_config, engine_config)

        with pytest.raises(EngineError):
            pool.start()

        assert not pool.is_started


class TestEnginePoolShutdown:
    """Tests for pool shutdown."""

    def test_shutdown_success(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Pool shuts down gracefully."""
        pool_config.size = 2
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        pool.shutdown()

        assert pool.is_shutdown
        mock_simple_engine.quit.assert_called()

    def test_shutdown_not_started(self) -> None:
        """Shutting down unstarted pool is safe."""
        pool = EnginePool()
        pool.shutdown()  # Should not raise

    def test_shutdown_idempotent(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Multiple shutdowns are safe."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        pool.shutdown()
        pool.shutdown()  # Should not raise


class TestEnginePoolAcquireRelease:
    """Tests for acquiring and releasing engines."""

    def test_acquire_success(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Can acquire engine from pool."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        engine = pool.acquire()
        assert engine is not None
        assert isinstance(engine, StockfishEngine)

        pool.release(engine)
        pool.shutdown()

    def test_acquire_not_started(self) -> None:
        """Cannot acquire from unstarted pool."""
        pool = EnginePool()

        with pytest.raises(PoolShutdownError, match="not started"):
            pool.acquire()

    def test_acquire_after_shutdown(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Cannot acquire after shutdown."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()
        pool.shutdown()

        with pytest.raises(PoolShutdownError):
            pool.acquire()

    def test_acquire_timeout(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Acquire times out when pool is exhausted."""
        pool_config.size = 1
        pool_config.acquire_timeout = 0.1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        # Acquire the only engine
        engine = pool.acquire()

        # Try to acquire another - should timeout
        with pytest.raises(PoolExhaustedError, match="timeout"):
            pool.acquire(timeout=0.1)

        pool.release(engine)
        pool.shutdown()

    def test_release_returns_to_pool(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Released engine is available again."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        engine1 = pool.acquire()
        pool.release(engine1)

        engine2 = pool.acquire()
        assert engine2 is engine1

        pool.release(engine2)
        pool.shutdown()


class TestEnginePoolContextManager:
    """Tests for the context manager interface."""

    def test_context_manager_success(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Context manager acquires and releases correctly."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        with pool.engine() as eng:
            assert eng is not None

        # Engine should be back in pool
        health = pool.health_check()
        assert health["available"] == 1

        pool.shutdown()

    def test_context_manager_exception(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Context manager releases on exception."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        try:
            with pool.engine() as eng:
                raise ValueError("test error")
        except ValueError:
            pass

        # Engine should still be back in pool
        health = pool.health_check()
        assert health["available"] == 1

        pool.shutdown()


class TestEnginePoolConcurrency:
    """Tests for concurrent access."""

    def test_concurrent_acquire_release(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Multiple threads can safely acquire/release."""
        pool_config.size = 4
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        results = []
        errors = []

        def worker(worker_id: int) -> None:
            try:
                for _ in range(3):
                    with pool.engine(timeout=5.0) as eng:
                        # Simulate some work
                        time.sleep(0.01)
                        results.append(worker_id)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert len(errors) == 0, f"Errors: {errors}"
        assert len(results) == 12  # 4 workers * 3 iterations

        pool.shutdown()


class TestEnginePoolHealthCheck:
    """Tests for health check functionality."""

    def test_health_check_all_healthy(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Health check reports all healthy engines."""
        pool_config.size = 3
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        health = pool.health_check()

        assert health["total"] == 3
        assert health["healthy"] == 3
        assert health["available"] == 3
        assert health["version"] == "Stockfish 16 Mock"

        pool.shutdown()

    def test_health_check_with_dead_engine(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Health check detects dead engines."""
        pool_config.size = 2
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        # Simulate one engine dying
        mock_simple_engine.protocol.returncode = 1

        health = pool.health_check()

        assert health["total"] == 2
        assert health["healthy"] == 0  # All show as dead due to shared mock

        pool.shutdown()


class TestEnginePoolRestart:
    """Tests for engine restart functionality."""

    def test_acquire_restarts_dead_engine(
        self,
        mock_simple_engine: MagicMock,
        pool_config: PoolConfig,
        engine_config: EngineConfig,
    ) -> None:
        """Acquiring a dead engine triggers restart."""
        pool_config.size = 1
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        # Simulate engine death
        mock_simple_engine.protocol.returncode = 1

        # Should restart and return
        engine = pool.acquire()
        assert engine is not None

        pool.release(engine)
        pool.shutdown()
