"""
Simple engine manager for Stockfish 16.

Unlike the main Stockfish pool which handles high concurrency,
SF16 is used infrequently for classical eval. This provides a
minimal thread-safe wrapper around a single engine instance.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, TypedDict

from common import EngineUnavailableError

from .config import Stockfish16Config
from .engine import ClassicalEvalResult, Stockfish16Engine

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class HealthStatus(TypedDict):
    """Health check result."""

    healthy: bool
    version: str


# Re-export for backwards compatibility
__all__ = ["EngineUnavailableError", "Stockfish16Manager", "HealthStatus"]


class Stockfish16Manager:
    """
    Simple thread-safe manager for a single SF16 engine.

    Designed for low-frequency classical eval requests.
    Uses a mutex to serialize access rather than a pool.

    Usage:
        manager = Stockfish16Manager(config)
        manager.start()

        result = manager.get_classical_eval(fen)

        manager.shutdown()
    """

    def __init__(self, config: Stockfish16Config | None = None) -> None:
        """Initialize the engine manager."""
        self._config = config or Stockfish16Config()
        self._engine: Stockfish16Engine | None = None
        self._lock = threading.Lock()
        self._shutdown = False

    @property
    def is_started(self) -> bool:
        """Check if the engine has been started."""
        return self._engine is not None and self._engine.is_alive()

    def start(self) -> None:
        """Start the SF16 engine."""
        with self._lock:
            if self._engine is not None:
                logger.warning("Engine already started")
                return

            if self._shutdown:
                raise EngineUnavailableError("Manager has been shut down")

            logger.info(f"Starting SF16 engine from {self._config.engine_path}")
            self._engine = Stockfish16Engine(self._config)
            self._engine.start()
            logger.info(f"SF16 engine started: {self._engine.version}")

    def shutdown(self) -> None:
        """Stop the engine."""
        with self._lock:
            self._shutdown = True
            if self._engine is not None:
                logger.info("Shutting down SF16 engine")
                self._engine.stop()
                self._engine = None
                logger.info("SF16 engine stopped")

    def get_classical_eval(self, fen: str) -> ClassicalEvalResult:
        """
        Get classical evaluation for a position.

        Thread-safe - serializes access to the engine.

        Args:
            fen: Position in FEN notation.

        Returns:
            ClassicalEvalResult with detailed breakdown.

        Raises:
            EngineUnavailableError: If engine not started or shutting down.
        """
        with self._lock:
            if self._shutdown:
                raise EngineUnavailableError("Manager is shutting down")

            if self._engine is None:
                raise EngineUnavailableError("Engine not started")

            # Restart if engine died
            if not self._engine.is_alive():
                logger.warning("Engine died, restarting...")
                self._engine.stop()
                self._engine = Stockfish16Engine(self._config)
                self._engine.start()

            return self._engine.get_classical_eval(fen)

    def health_check(self) -> HealthStatus:
        """Check engine health."""
        with self._lock:
            if self._engine is None:
                return {"healthy": False, "version": "not started"}

            return {
                "healthy": self._engine.is_alive(),
                "version": self._engine.version,
            }
