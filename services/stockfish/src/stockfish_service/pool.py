"""
Thread-safe connection pool for Stockfish engines.

Provides concurrent access to multiple Stockfish instances
with automatic health monitoring and graceful shutdown.
"""

from __future__ import annotations

import contextlib
import logging
import queue
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING, TypedDict

from common import EngineError, PoolExhaustedError, PoolShutdownError

from .config import EngineConfig, PoolConfig
from .engine import StockfishEngine


class HealthStatus(TypedDict):
    """Health check result type."""

    total: int
    available: int
    healthy: int
    version: str


if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Re-export for backwards compatibility
__all__ = ["PoolExhaustedError", "PoolShutdownError", "EnginePool"]


class EnginePool:
    """
    Thread-safe pool of Stockfish engine instances.

    Manages a pool of engine processes for concurrent evaluations.
    Automatically handles engine lifecycle, health monitoring, and
    graceful shutdown.

    Usage:
        pool = EnginePool(pool_config, engine_config)
        pool.start()

        # Use context manager for automatic release
        with pool.engine() as eng:
            result = eng.evaluate(fen)

        pool.shutdown()
    """

    def __init__(
        self,
        pool_config: PoolConfig | None = None,
        engine_config: EngineConfig | None = None,
    ) -> None:
        """Initialize the engine pool.

        Args:
            pool_config: Pool configuration (size, timeouts).
            engine_config: Engine configuration for each instance.
        """
        self._pool_config = pool_config or PoolConfig()
        self._engine_config = engine_config or EngineConfig()

        self._engines: list[StockfishEngine] = []
        self._available: queue.Queue[StockfishEngine] = queue.Queue()
        self._lock = threading.Lock()
        self._shutdown = False
        self._started = False

    @property
    def size(self) -> int:
        """Get the configured pool size."""
        return self._pool_config.size

    @property
    def is_started(self) -> bool:
        """Check if the pool has been started."""
        return self._started

    @property
    def is_shutdown(self) -> bool:
        """Check if the pool is shutting down."""
        return self._shutdown

    def start(self) -> None:
        """Start all engines in the pool.

        Creates and initializes the configured number of engine instances.
        Raises EngineError if any engine fails to start.
        """
        if self._started:
            logger.warning("Pool already started")
            return

        if self._shutdown:
            raise PoolShutdownError("Pool has been shut down")

        logger.info(f"Starting engine pool with {self._pool_config.size} engines")

        for i in range(self._pool_config.size):
            try:
                engine = self._create_engine()
                self._engines.append(engine)
                self._available.put(engine)
                logger.debug(f"Engine {i + 1}/{self._pool_config.size} started")
            except Exception as e:
                # Cleanup already started engines
                logger.error(f"Failed to start engine {i + 1}: {e}")
                self._cleanup_engines()
                raise EngineError(f"Failed to initialize pool: {e}") from e

        self._started = True
        logger.info(
            f"Engine pool started: {len(self._engines)} engines, "
            f"version: {self._engines[0].version if self._engines else 'unknown'}"
        )

    def shutdown(self, timeout: float = 10.0) -> None:
        """Gracefully shutdown all engines in the pool.

        Args:
            timeout: Maximum time to wait for shutdown (seconds).
        """
        if self._shutdown:
            return

        logger.info("Shutting down engine pool")
        self._shutdown = True

        # Give in-flight operations time to complete
        # by draining the queue
        deadline = threading.Event()
        deadline.wait(min(timeout / 2, 1.0))

        self._cleanup_engines()
        self._started = False
        logger.info("Engine pool shutdown complete")

    def _cleanup_engines(self) -> None:
        """Stop all engines and clear the pool."""
        with self._lock:
            for engine in self._engines:
                try:
                    engine.stop()
                except Exception as e:
                    logger.warning(f"Error stopping engine: {e}")
            self._engines.clear()

            # Clear the queue
            while not self._available.empty():
                try:
                    self._available.get_nowait()
                except queue.Empty:
                    break

    def _create_engine(self) -> StockfishEngine:
        """Create and start a new engine instance."""
        engine = StockfishEngine(self._engine_config)
        engine.start()
        return engine

    def acquire(self, timeout: float | None = None) -> StockfishEngine:
        """Acquire an engine from the pool.

        Args:
            timeout: Maximum time to wait (uses pool default if None).

        Returns:
            An available StockfishEngine instance.

        Raises:
            PoolShutdownError: If the pool is shutting down.
            PoolExhaustedError: If no engine available within timeout.
        """
        if self._shutdown:
            raise PoolShutdownError("Pool is shutting down")

        if not self._started:
            raise PoolShutdownError("Pool not started")

        timeout = timeout if timeout is not None else self._pool_config.acquire_timeout

        try:
            engine = self._available.get(timeout=timeout)
        except queue.Empty as e:
            raise PoolExhaustedError(f"No engine available within {timeout}s timeout") from e

        # Verify engine is healthy, restart if needed
        if not engine.is_alive():
            logger.warning("Acquired engine is dead, restarting")
            engine = self._restart_engine(engine)

        return engine

    def release(self, engine: StockfishEngine) -> None:
        """Return an engine to the pool.

        Args:
            engine: The engine to release back to the pool.
        """
        if self._shutdown:
            # Pool is shutting down, just stop the engine
            with contextlib.suppress(Exception):
                engine.stop()
            return

        # Reset engine state for next use
        try:
            engine.new_game()
        except EngineError as e:
            logger.warning(f"Error resetting engine: {e}")
            # Engine state is corrupted, must restart
            try:
                engine = self._restart_engine(engine)
            except Exception as restart_error:
                logger.error(f"Failed to restart engine: {restart_error}, dropping from pool")
                # Remove the dead engine from our tracking list
                with self._lock:
                    if engine in self._engines:
                        self._engines.remove(engine)
                return

        self._available.put(engine)

    @contextmanager
    def engine(self, timeout: float | None = None) -> Iterator[StockfishEngine]:
        """Context manager for acquiring and releasing an engine.

        Args:
            timeout: Maximum time to wait for an engine.

        Yields:
            An available StockfishEngine instance.

        Example:
            with pool.engine() as eng:
                result = eng.evaluate(fen)
        """
        eng = self.acquire(timeout)
        try:
            yield eng
        finally:
            self.release(eng)

    def _restart_engine(self, engine: StockfishEngine) -> StockfishEngine:
        """Restart a dead or unhealthy engine.

        Args:
            engine: The engine to restart.

        Returns:
            The restarted engine (or a new one if restart fails).
        """
        with contextlib.suppress(Exception):
            engine.stop()

        # Try to restart
        retries = self._pool_config.max_retries
        for attempt in range(retries):
            try:
                engine.start()
                logger.info(f"Engine restarted successfully (attempt {attempt + 1})")
                return engine
            except Exception as e:
                logger.warning(f"Engine restart attempt {attempt + 1} failed: {e}")

        # All retries failed, create a new engine
        logger.warning("Creating new engine after restart failures")
        new_engine = self._create_engine()

        # Update engine list
        with self._lock:
            if engine in self._engines:
                idx = self._engines.index(engine)
                self._engines[idx] = new_engine

        return new_engine

    def health_check(self) -> HealthStatus:
        """Check the health of all engines in the pool.

        Returns:
            Dict with 'total', 'available', 'healthy' counts and 'version'.
        """
        with self._lock:
            total = len(self._engines)
            healthy = sum(1 for e in self._engines if e.is_alive())
            available = self._available.qsize()
            version = self._engines[0].version if self._engines else "unknown"

        return {
            "total": total,
            "available": available,
            "healthy": healthy,
            "version": version,
        }
