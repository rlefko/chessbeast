"""
Unit tests for the Stockfish 16 engine manager.

Tests thread-safe access to the SF16 engine.
"""

import threading
from unittest.mock import MagicMock, patch

import pytest
from stockfish16_service.config import Stockfish16Config
from stockfish16_service.engine import ClassicalEvalResult, PhaseScore
from stockfish16_service.pool import (
    EngineUnavailableError,
    Stockfish16Manager,
)

from conftest import STARTING_FEN


@pytest.fixture
def mock_engine():
    """Create a mock Stockfish16Engine."""
    with patch("stockfish16_service.pool.Stockfish16Engine") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.is_alive.return_value = True
        mock_instance.version = "Stockfish 16 Mock"

        # Create a sample eval result
        mock_result = ClassicalEvalResult()
        mock_result.mobility.total = PhaseScore(mg=0.45, eg=0.31)
        mock_result.king_safety.total = PhaseScore(mg=0.18, eg=-0.04)
        mock_result.total.total = PhaseScore(mg=0.56, eg=0.41)
        mock_result.final_eval_cp = 48

        mock_instance.get_classical_eval.return_value = mock_result
        mock_cls.return_value = mock_instance

        yield mock_instance


class TestStockfish16ManagerInit:
    """Tests for manager initialization."""

    def test_init_with_defaults(self) -> None:
        """Manager can be created with default config."""
        manager = Stockfish16Manager()
        assert not manager.is_started

    def test_init_with_custom_config(self, config: Stockfish16Config) -> None:
        """Manager can be created with custom config."""
        manager = Stockfish16Manager(config)
        assert not manager.is_started


class TestStockfish16ManagerStart:
    """Tests for manager startup."""

    def test_start_success(self, mock_engine: MagicMock) -> None:
        """Manager starts the engine successfully."""
        manager = Stockfish16Manager()
        manager.start()

        assert manager.is_started
        mock_engine.start.assert_called_once()

        manager.shutdown()

    def test_start_already_started(self, mock_engine: MagicMock) -> None:
        """Starting already started manager is safe."""
        manager = Stockfish16Manager()
        manager.start()
        manager.start()  # Should not raise

        # Engine.start should only be called once
        mock_engine.start.assert_called_once()

        manager.shutdown()

    def test_start_after_shutdown(self, mock_engine: MagicMock) -> None:
        """Cannot start manager after shutdown."""
        manager = Stockfish16Manager()
        manager.start()
        manager.shutdown()

        with pytest.raises(EngineUnavailableError, match="shut down"):
            manager.start()


class TestStockfish16ManagerShutdown:
    """Tests for manager shutdown."""

    def test_shutdown_success(self, mock_engine: MagicMock) -> None:
        """Manager shuts down the engine."""
        manager = Stockfish16Manager()
        manager.start()
        manager.shutdown()

        mock_engine.stop.assert_called_once()
        assert not manager.is_started

    def test_shutdown_not_started(self) -> None:
        """Shutting down unstarted manager is safe."""
        manager = Stockfish16Manager()
        manager.shutdown()  # Should not raise

    def test_shutdown_idempotent(self, mock_engine: MagicMock) -> None:
        """Multiple shutdowns are safe."""
        manager = Stockfish16Manager()
        manager.start()
        manager.shutdown()
        manager.shutdown()  # Should not raise


class TestStockfish16ManagerGetClassicalEval:
    """Tests for getting classical evaluation."""

    def test_get_eval_success(self, mock_engine: MagicMock) -> None:
        """Can get classical eval from manager."""
        manager = Stockfish16Manager()
        manager.start()

        result = manager.get_classical_eval(STARTING_FEN)

        assert isinstance(result, ClassicalEvalResult)
        assert result.mobility.total.mg == pytest.approx(0.45)
        assert result.final_eval_cp == 48
        mock_engine.get_classical_eval.assert_called_once_with(STARTING_FEN)

        manager.shutdown()

    def test_get_eval_not_started(self) -> None:
        """Cannot get eval from unstarted manager."""
        manager = Stockfish16Manager()

        with pytest.raises(EngineUnavailableError, match="not started"):
            manager.get_classical_eval(STARTING_FEN)

    def test_get_eval_after_shutdown(self, mock_engine: MagicMock) -> None:
        """Cannot get eval after shutdown."""
        manager = Stockfish16Manager()
        manager.start()
        manager.shutdown()

        with pytest.raises(EngineUnavailableError, match="shutting down"):
            manager.get_classical_eval(STARTING_FEN)

    def test_get_eval_restarts_dead_engine(self, mock_engine: MagicMock) -> None:
        """Manager restarts engine if it dies."""
        manager = Stockfish16Manager()
        manager.start()

        # Simulate engine death
        mock_engine.is_alive.return_value = False

        # Should restart and return result
        result = manager.get_classical_eval(STARTING_FEN)

        assert result is not None
        # Engine should have been restarted (stop + new engine start)
        mock_engine.stop.assert_called()

        manager.shutdown()


class TestStockfish16ManagerHealthCheck:
    """Tests for health check functionality."""

    def test_health_check_not_started(self) -> None:
        """Health check reports not started."""
        manager = Stockfish16Manager()
        health = manager.health_check()

        assert health["healthy"] is False
        assert health["version"] == "not started"

    def test_health_check_healthy(self, mock_engine: MagicMock) -> None:
        """Health check reports healthy engine."""
        manager = Stockfish16Manager()
        manager.start()

        health = manager.health_check()

        assert health["healthy"] is True
        assert health["version"] == "Stockfish 16 Mock"

        manager.shutdown()

    def test_health_check_unhealthy(self, mock_engine: MagicMock) -> None:
        """Health check detects dead engine."""
        manager = Stockfish16Manager()
        manager.start()

        # Simulate engine death
        mock_engine.is_alive.return_value = False

        health = manager.health_check()

        assert health["healthy"] is False

        manager.shutdown()


class TestStockfish16ManagerConcurrency:
    """Tests for thread-safe access."""

    def test_concurrent_eval_requests(self, mock_engine: MagicMock) -> None:
        """Multiple threads can safely request evals."""
        manager = Stockfish16Manager()
        manager.start()

        results = []
        errors = []

        def worker(worker_id: int) -> None:
            try:
                for _ in range(5):
                    result = manager.get_classical_eval(STARTING_FEN)
                    results.append((worker_id, result.final_eval_cp))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert len(errors) == 0, f"Errors: {errors}"
        assert len(results) == 20  # 4 workers * 5 iterations

        manager.shutdown()

    def test_concurrent_start_stop(self, mock_engine: MagicMock) -> None:
        """Start/shutdown are thread-safe."""
        manager = Stockfish16Manager()
        errors = []

        def start_worker() -> None:
            try:
                manager.start()
            except Exception as e:
                errors.append(e)

        def stop_worker() -> None:
            try:
                manager.shutdown()
            except Exception as e:
                errors.append(e)

        # Start multiple threads trying to start/stop
        threads = []
        for _ in range(3):
            threads.append(threading.Thread(target=start_worker))
            threads.append(threading.Thread(target=stop_worker))

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        # Errors may happen (e.g., start after shutdown) but no crashes
        # Filter out expected errors
        unexpected_errors = [e for e in errors if not isinstance(e, EngineUnavailableError)]
        assert len(unexpected_errors) == 0, f"Unexpected errors: {unexpected_errors}"
