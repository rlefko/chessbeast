"""
Unit tests for the Stockfish 16 engine wrapper.

Tests engine startup, shutdown, and classical eval extraction.
Uses mocked subprocess to avoid requiring an actual SF16 binary.
"""

from unittest.mock import MagicMock, patch

import pytest
from stockfish16_service.config import Stockfish16Config
from stockfish16_service.engine import (
    ClassicalEvalResult,
    EngineError,
    EngineStartupError,
    InvalidFenError,
    PhaseScore,
    SideBreakdown,
    Stockfish16Engine,
)

from conftest import SAMPLE_EVAL_OUTPUT, STARTING_FEN


def create_mock_process(responses: list[str]) -> MagicMock:
    """Create a mock subprocess with predefined responses."""
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # Process is running
    mock_proc.stdin = MagicMock()
    mock_proc.stderr = MagicMock()
    mock_proc.wait = MagicMock()

    # Create an iterator for stdout.readline
    response_iter = iter(line + "\n" for line in responses)
    mock_proc.stdout = MagicMock()
    mock_proc.stdout.readline.side_effect = lambda: next(response_iter, "")
    mock_proc.stdout.fileno.return_value = 1

    return mock_proc


# Standard UCI startup sequence
UCI_STARTUP = [
    "id name Stockfish 16",
    "id author T. Romstad, M. Costalba, J. Kiiski, G. Linscott",
    "option name Threads type spin default 1 min 1 max 512",
    "option name Hash type spin default 16 min 1 max 33554432",
    "uciok",
    "readyok",
]


class TestStockfish16EngineInit:
    """Tests for engine initialization."""

    def test_init_with_default_config(self) -> None:
        """Engine can be created with default config."""
        engine = Stockfish16Engine()
        assert engine.version == "not started"
        assert not engine.is_alive()

    def test_init_with_custom_config(self, config: Stockfish16Config) -> None:
        """Engine can be created with custom config."""
        engine = Stockfish16Engine(config)
        assert engine.path == config.engine_path


class TestStockfish16EngineStart:
    """Tests for engine startup."""

    def test_start_success(self) -> None:
        """Engine starts successfully and extracts version."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()

            assert engine.is_alive()
            assert engine.version == "Stockfish 16"
            mock_proc.stdin.write.assert_any_call("uci\n")
            mock_proc.stdin.write.assert_any_call("isready\n")

            engine.stop()

    def test_start_configures_options(self) -> None:
        """Engine configures threads and hash on startup."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            config = Stockfish16Config(engine_threads=4, engine_hash_mb=256)
            engine = Stockfish16Engine(config)
            engine.start()

            # Check setoption commands were sent
            calls = [str(c) for c in mock_proc.stdin.write.call_args_list]
            assert any("Threads value 4" in c for c in calls)
            assert any("Hash value 256" in c for c in calls)

            engine.stop()

    def test_start_file_not_found(self) -> None:
        """Engine raises error when binary not found."""
        with patch("stockfish16_service.engine.subprocess.Popen") as mock:
            mock.side_effect = FileNotFoundError("stockfish not found")

            engine = Stockfish16Engine()
            with pytest.raises(EngineStartupError, match="not found"):
                engine.start()

    def test_start_already_started(self) -> None:
        """Starting already started engine stops it first."""
        mock_proc = create_mock_process(UCI_STARTUP * 2)  # Double for second start

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()

            # Reset mock for second start
            mock_proc.stdin.reset_mock()

            # Start again - should stop first
            engine.start()

            assert engine.is_alive()
            engine.stop()


class TestStockfish16EngineStop:
    """Tests for engine shutdown."""

    def test_stop_success(self) -> None:
        """Engine stops gracefully."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()
            engine.stop()

            mock_proc.stdin.write.assert_any_call("quit\n")
            mock_proc.wait.assert_called_once()
            assert not engine.is_alive()
            assert engine.version == "not started"

    def test_stop_not_started(self) -> None:
        """Stopping an unstarted engine is safe."""
        engine = Stockfish16Engine()
        engine.stop()  # Should not raise


class TestStockfish16EngineIsAlive:
    """Tests for engine health check."""

    def test_is_alive_not_started(self) -> None:
        """Unstarted engine is not alive."""
        engine = Stockfish16Engine()
        assert not engine.is_alive()

    def test_is_alive_after_start(self) -> None:
        """Started engine is alive."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()
            assert engine.is_alive()
            engine.stop()

    def test_is_alive_after_crash(self) -> None:
        """Engine detects crash via poll() return value."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()

            # Simulate crash - poll() returns exit code when process ends
            mock_proc.poll.return_value = 1
            assert not engine.is_alive()


class TestStockfish16EngineGetClassicalEval:
    """Tests for classical evaluation extraction."""

    def test_get_eval_not_started(self) -> None:
        """Getting eval fails if engine not started."""
        engine = Stockfish16Engine()
        with pytest.raises(EngineError, match="not started"):
            engine.get_classical_eval(STARTING_FEN)

    def test_get_eval_invalid_fen(self) -> None:
        """Getting eval fails with invalid FEN."""
        mock_proc = create_mock_process(UCI_STARTUP)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()

            with pytest.raises(InvalidFenError):
                engine.get_classical_eval("invalid fen string")

            engine.stop()

    def test_get_eval_success(self) -> None:
        """Getting eval returns parsed result."""
        # UCI startup + eval output + empty line to terminate
        responses = UCI_STARTUP + SAMPLE_EVAL_OUTPUT + [""]
        mock_proc = create_mock_process(responses)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()

            result = engine.get_classical_eval(STARTING_FEN)

            assert isinstance(result, ClassicalEvalResult)
            assert result.mobility.total.mg == pytest.approx(0.45)
            assert result.king_safety.total.mg == pytest.approx(0.18)

            engine.stop()

    def test_get_eval_sends_correct_commands(self) -> None:
        """Getting eval sends position and eval commands."""
        responses = UCI_STARTUP + SAMPLE_EVAL_OUTPUT + [""]
        mock_proc = create_mock_process(responses)

        with (
            patch("stockfish16_service.engine.subprocess.Popen", return_value=mock_proc),
            patch("select.select", return_value=([True], [], [])),
        ):
            engine = Stockfish16Engine()
            engine.start()
            engine.get_classical_eval(STARTING_FEN)

            calls = [str(c) for c in mock_proc.stdin.write.call_args_list]
            assert any(f"position fen {STARTING_FEN}" in c for c in calls)
            assert any("'eval" in c for c in calls)

            engine.stop()


class TestPhaseScore:
    """Tests for the PhaseScore dataclass."""

    def test_default_values(self) -> None:
        """PhaseScore has sensible defaults."""
        score = PhaseScore()
        assert score.mg == 0.0
        assert score.eg == 0.0

    def test_with_values(self) -> None:
        """PhaseScore stores provided values."""
        score = PhaseScore(mg=0.5, eg=-0.3)
        assert score.mg == 0.5
        assert score.eg == -0.3


class TestSideBreakdown:
    """Tests for the SideBreakdown dataclass."""

    def test_default_values(self) -> None:
        """SideBreakdown has sensible defaults."""
        breakdown = SideBreakdown()
        assert breakdown.white.mg == 0.0
        assert breakdown.black.mg == 0.0
        assert breakdown.total.mg == 0.0

    def test_with_values(self) -> None:
        """SideBreakdown stores provided values."""
        breakdown = SideBreakdown(
            white=PhaseScore(mg=0.5, eg=0.3),
            black=PhaseScore(mg=-0.5, eg=-0.3),
            total=PhaseScore(mg=0.0, eg=0.0),
        )
        assert breakdown.white.mg == 0.5
        assert breakdown.black.mg == -0.5


class TestClassicalEvalResult:
    """Tests for the ClassicalEvalResult dataclass."""

    def test_default_values(self) -> None:
        """ClassicalEvalResult has sensible defaults."""
        result = ClassicalEvalResult()
        assert result.material.total.mg == 0.0
        assert result.mobility.total.mg == 0.0
        assert result.king_safety.total.mg == 0.0
        assert result.final_eval_cp == 0

    def test_all_fields_present(self) -> None:
        """ClassicalEvalResult has all expected fields."""
        result = ClassicalEvalResult()

        # Check all breakdown fields exist
        assert hasattr(result, "material")
        assert hasattr(result, "imbalance")
        assert hasattr(result, "pawns")
        assert hasattr(result, "knights")
        assert hasattr(result, "bishops")
        assert hasattr(result, "rooks")
        assert hasattr(result, "queens")
        assert hasattr(result, "mobility")
        assert hasattr(result, "king_safety")
        assert hasattr(result, "threats")
        assert hasattr(result, "passed")
        assert hasattr(result, "space")
        assert hasattr(result, "winnable")
        assert hasattr(result, "total")
        assert hasattr(result, "final_eval_cp")
