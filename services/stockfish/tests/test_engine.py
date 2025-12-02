"""
Unit tests for the Stockfish engine wrapper.
"""

from unittest.mock import MagicMock

import chess
import chess.engine
import pytest

from stockfish_service.config import EngineConfig
from stockfish_service.engine import (
    EngineError,
    EngineStartupError,
    EvaluationResult,
    InvalidFenError,
    StockfishEngine,
)


class TestStockfishEngineInit:
    """Tests for engine initialization."""

    def test_init_with_default_config(self) -> None:
        """Engine can be created with default config."""
        engine = StockfishEngine()
        assert engine.version == "not started"
        assert not engine.is_alive()

    def test_init_with_custom_config(self, engine_config: EngineConfig) -> None:
        """Engine can be created with custom config."""
        engine = StockfishEngine(engine_config)
        assert engine.path == engine_config.stockfish_path


class TestStockfishEngineStart:
    """Tests for engine startup."""

    def test_start_success(self, mock_simple_engine: MagicMock) -> None:
        """Engine starts successfully."""
        engine = StockfishEngine()
        engine.start()

        assert engine.is_alive()
        assert engine.version == "Stockfish 16 Mock"
        # Default threads=8 and hash=2048, so configure is called
        mock_simple_engine.configure.assert_any_call({"Threads": 8})
        mock_simple_engine.configure.assert_any_call({"Hash": 2048})

        engine.stop()

    def test_start_with_custom_threads(
        self, mock_simple_engine: MagicMock, engine_config: EngineConfig
    ) -> None:
        """Engine configures custom thread count."""
        engine_config.threads = 4
        engine = StockfishEngine(engine_config)
        engine.start()

        mock_simple_engine.configure.assert_any_call({"Threads": 4})
        engine.stop()

    def test_start_with_custom_hash(
        self, mock_simple_engine: MagicMock, engine_config: EngineConfig
    ) -> None:
        """Engine configures custom hash size."""
        engine_config.hash_mb = 128
        engine = StockfishEngine(engine_config)
        engine.start()

        mock_simple_engine.configure.assert_any_call({"Hash": 128})
        engine.stop()

    def test_start_file_not_found(self, monkeypatch) -> None:
        """Engine raises error when binary not found."""

        def mock_popen(*args, **kwargs):
            raise FileNotFoundError("stockfish not found")

        monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", mock_popen)

        engine = StockfishEngine()
        with pytest.raises(EngineStartupError, match="not found"):
            engine.start()

    def test_start_engine_crash(self, monkeypatch) -> None:
        """Engine raises error when engine crashes on startup."""

        def mock_popen(*args, **kwargs):
            raise chess.engine.EngineTerminatedError("crash")

        monkeypatch.setattr(chess.engine.SimpleEngine, "popen_uci", mock_popen)

        engine = StockfishEngine()
        with pytest.raises(EngineStartupError, match="terminated"):
            engine.start()


class TestStockfishEngineStop:
    """Tests for engine shutdown."""

    def test_stop_success(self, mock_simple_engine: MagicMock) -> None:
        """Engine stops gracefully."""
        engine = StockfishEngine()
        engine.start()
        engine.stop()

        mock_simple_engine.quit.assert_called_once()
        assert not engine.is_alive()
        assert engine.version == "not started"

    def test_stop_not_started(self) -> None:
        """Stopping an unstarted engine is safe."""
        engine = StockfishEngine()
        engine.stop()  # Should not raise


class TestStockfishEngineIsAlive:
    """Tests for engine health check."""

    def test_is_alive_not_started(self) -> None:
        """Unstarted engine is not alive."""
        engine = StockfishEngine()
        assert not engine.is_alive()

    def test_is_alive_after_start(self, mock_simple_engine: MagicMock) -> None:
        """Started engine is alive."""
        engine = StockfishEngine()
        engine.start()
        assert engine.is_alive()
        engine.stop()

    def test_is_alive_after_crash(self, mock_simple_engine: MagicMock) -> None:
        """Engine detects crash via returncode."""
        engine = StockfishEngine()
        engine.start()

        # Simulate crash - transport.get_returncode() returns non-None when process exits
        mock_simple_engine.protocol.transport.get_returncode.return_value = 1
        assert not engine.is_alive()


class TestStockfishEngineEvaluate:
    """Tests for position evaluation."""

    def test_evaluate_not_started(self, starting_fen: str) -> None:
        """Evaluation fails if engine not started."""
        engine = StockfishEngine()
        with pytest.raises(EngineError, match="not started"):
            engine.evaluate(starting_fen)

    def test_evaluate_invalid_fen(self, mock_simple_engine: MagicMock) -> None:
        """Evaluation fails with invalid FEN."""
        engine = StockfishEngine()
        engine.start()

        with pytest.raises(InvalidFenError):
            engine.evaluate("invalid fen string")

        engine.stop()

    def test_evaluate_starting_position(
        self, mock_simple_engine: MagicMock, starting_fen: str
    ) -> None:
        """Evaluate starting position."""
        # Setup mock response
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = False
        mock_score.white.return_value.score.return_value = 25

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 20,
            "pv": [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")],
        }

        engine = StockfishEngine()
        engine.start()

        result = engine.evaluate(starting_fen, depth=20)

        assert result.cp == 25
        assert result.mate == 0
        assert result.depth == 20
        assert result.best_line == ["e2e4", "e7e5"]
        assert result.alternatives == []

        engine.stop()

    def test_evaluate_mate_position(
        self, mock_simple_engine: MagicMock, mate_in_1_fen: str
    ) -> None:
        """Evaluate position with mate score."""
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = True
        mock_score.white.return_value.mate.return_value = 1

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 5,
            "pv": [chess.Move.from_uci("e1e8")],
        }

        engine = StockfishEngine()
        engine.start()

        result = engine.evaluate(mate_in_1_fen, depth=10)

        assert result.cp == 0
        assert result.mate == 1
        assert result.best_line == ["e1e8"]

        engine.stop()

    def test_evaluate_black_to_move(self, mock_simple_engine: MagicMock) -> None:
        """Score is from side-to-move perspective."""
        black_fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

        mock_score = MagicMock()
        mock_score.black.return_value.is_mate.return_value = False
        mock_score.black.return_value.score.return_value = -30

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 15,
            "pv": [],
        }

        engine = StockfishEngine()
        engine.start()

        result = engine.evaluate(black_fen)

        assert result.cp == -30  # From black's perspective
        mock_score.black.assert_called()

        engine.stop()

    def test_evaluate_with_time_limit(
        self, mock_simple_engine: MagicMock, starting_fen: str
    ) -> None:
        """Evaluation respects time limit."""
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = False
        mock_score.white.return_value.score.return_value = 0

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 12,
            "pv": [],
        }

        engine = StockfishEngine()
        engine.start()

        engine.evaluate(starting_fen, time_ms=1000)

        # Check that time limit was passed
        call_args = mock_simple_engine.analyse.call_args
        limit = call_args[0][1]  # Second positional arg
        assert limit.time == 1.0  # 1000ms = 1s

        engine.stop()

    def test_evaluate_with_node_limit(
        self, mock_simple_engine: MagicMock, starting_fen: str
    ) -> None:
        """Evaluation respects node limit."""
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = False
        mock_score.white.return_value.score.return_value = 0

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 8,
            "pv": [],
        }

        engine = StockfishEngine()
        engine.start()

        engine.evaluate(starting_fen, nodes=100000)

        call_args = mock_simple_engine.analyse.call_args
        limit = call_args[0][1]
        assert limit.nodes == 100000

        engine.stop()

    def test_evaluate_default_depth(self, mock_simple_engine: MagicMock, starting_fen: str) -> None:
        """Default to depth 20 when no limits specified."""
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = False
        mock_score.white.return_value.score.return_value = 0

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 20,
            "pv": [],
        }

        engine = StockfishEngine()
        engine.start()

        engine.evaluate(starting_fen)

        call_args = mock_simple_engine.analyse.call_args
        limit = call_args[0][1]
        assert limit.depth == 20

        engine.stop()

    def test_evaluate_multipv(self, mock_simple_engine: MagicMock, starting_fen: str) -> None:
        """Evaluation with MultiPV returns alternatives."""
        mock_score_1 = MagicMock()
        mock_score_1.white.return_value.is_mate.return_value = False
        mock_score_1.white.return_value.score.return_value = 30

        mock_score_2 = MagicMock()
        mock_score_2.white.return_value.is_mate.return_value = False
        mock_score_2.white.return_value.score.return_value = 20

        mock_score_3 = MagicMock()
        mock_score_3.white.return_value.is_mate.return_value = False
        mock_score_3.white.return_value.score.return_value = 15

        mock_simple_engine.analyse.return_value = [
            {"score": mock_score_1, "depth": 16, "pv": [chess.Move.from_uci("e2e4")]},
            {"score": mock_score_2, "depth": 16, "pv": [chess.Move.from_uci("d2d4")]},
            {"score": mock_score_3, "depth": 16, "pv": [chess.Move.from_uci("c2c4")]},
        ]

        engine = StockfishEngine()
        engine.start()

        result = engine.evaluate(starting_fen, depth=16, multipv=3)

        assert result.cp == 30
        assert result.best_line == ["e2e4"]
        assert len(result.alternatives) == 2
        assert result.alternatives[0].cp == 20
        assert result.alternatives[0].best_line == ["d2d4"]
        assert result.alternatives[1].cp == 15
        assert result.alternatives[1].best_line == ["c2c4"]

        # Verify multipv was passed to engine
        call_args = mock_simple_engine.analyse.call_args
        assert call_args.kwargs["multipv"] == 3

        engine.stop()

    def test_evaluate_multipv_clamped(
        self, mock_simple_engine: MagicMock, starting_fen: str
    ) -> None:
        """MultiPV is clamped to reasonable range."""
        mock_score = MagicMock()
        mock_score.white.return_value.is_mate.return_value = False
        mock_score.white.return_value.score.return_value = 0

        mock_simple_engine.analyse.return_value = {
            "score": mock_score,
            "depth": 10,
            "pv": [],
        }

        engine = StockfishEngine()
        engine.start()

        # Request too many PVs
        engine.evaluate(starting_fen, multipv=100)

        call_args = mock_simple_engine.analyse.call_args
        assert call_args.kwargs["multipv"] == 10  # Clamped to max

        # Request negative
        engine.evaluate(starting_fen, multipv=-1)

        call_args = mock_simple_engine.analyse.call_args
        assert call_args.kwargs["multipv"] == 1  # Clamped to min

        engine.stop()


class TestEvaluationResult:
    """Tests for the EvaluationResult dataclass."""

    def test_default_values(self) -> None:
        """EvaluationResult has sensible defaults."""
        result = EvaluationResult()
        assert result.cp == 0
        assert result.mate == 0
        assert result.depth == 0
        assert result.best_line == []
        assert result.alternatives == []

    def test_with_values(self) -> None:
        """EvaluationResult stores provided values."""
        result = EvaluationResult(
            cp=150,
            mate=0,
            depth=20,
            best_line=["e2e4", "e7e5"],
        )
        assert result.cp == 150
        assert result.depth == 20
        assert result.best_line == ["e2e4", "e7e5"]
