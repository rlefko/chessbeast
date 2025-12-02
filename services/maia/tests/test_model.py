"""Tests for Maia2Model wrapper."""

import pytest

from maia_service.model import (
    InvalidFenError,
    InvalidRatingError,
    Maia2Model,
    MaiaError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
    MovePrediction,
)

# Sample FEN positions
STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
CHECKMATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
STALEMATE_FEN = "8/8/8/8/8/5k2/5p2/5K2 w - - 0 1"
INVALID_FEN = "not-a-valid-fen"


class TestMaia2ModelInit:
    """Tests for Maia2Model initialization."""

    def test_init_with_default_config(self, mock_maia2_module):
        """Test initialization with default config."""
        model = Maia2Model()
        assert model.is_loaded is False
        assert model.model_type == "rapid"
        assert model.device == "cpu"

    def test_init_with_custom_config(self, mock_maia2_module, model_config):
        """Test initialization with custom config."""
        model = Maia2Model(model_config)
        assert model.is_loaded is False
        assert model.model_type == model_config.model_type
        assert model.device == model_config.device


class TestMaia2ModelLoad:
    """Tests for model loading."""

    def test_load_success(self, mock_maia2_module, model_config):
        """Test successful model loading."""
        model = Maia2Model(model_config)
        model.load()
        assert model.is_loaded is True

    def test_load_already_loaded(self, loaded_mock_model, caplog):
        """Test loading an already loaded model logs a warning."""
        loaded_mock_model.load()
        assert "already loaded" in caplog.text.lower()

    def test_load_import_error(self, monkeypatch, model_config):
        """Test that ImportError raises ModelLoadError."""
        import builtins

        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "maia2" or name.startswith("maia2."):
                raise ImportError("No module named 'maia2'")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", mock_import)

        model = Maia2Model(model_config)

        with pytest.raises(ModelLoadError) as exc_info:
            model.load()

        assert "maia2" in str(exc_info.value).lower()


class TestMaia2ModelPredict:
    """Tests for move prediction."""

    def test_predict_not_loaded(self, mock_model):
        """Test prediction fails when model not loaded."""
        with pytest.raises(ModelNotLoadedError) as exc_info:
            mock_model.predict(STARTING_FEN, 1500)

        assert "not loaded" in str(exc_info.value).lower()

    def test_predict_success(self, loaded_mock_model):
        """Test successful prediction."""
        predictions = loaded_mock_model.predict(STARTING_FEN, 1500)

        assert len(predictions) > 0
        assert all(isinstance(p, MovePrediction) for p in predictions)
        # Predictions should be sorted by probability (descending)
        for i in range(len(predictions) - 1):
            assert predictions[i].probability >= predictions[i + 1].probability

    def test_predict_top_k(self, loaded_mock_model):
        """Test that top_k limits results."""
        predictions = loaded_mock_model.predict(STARTING_FEN, 1500, top_k=3)
        assert len(predictions) <= 3

    def test_predict_invalid_fen(self, loaded_mock_model):
        """Test prediction with invalid FEN raises error."""
        with pytest.raises(InvalidFenError) as exc_info:
            loaded_mock_model.predict(INVALID_FEN, 1500)

        assert "Invalid FEN" in str(exc_info.value)

    def test_predict_invalid_elo_self_too_low(self, loaded_mock_model):
        """Test prediction with ELO below 1100 raises error."""
        with pytest.raises(InvalidRatingError) as exc_info:
            loaded_mock_model.predict(STARTING_FEN, 1000)

        assert "Rating must be between 1100 and 1900" in str(exc_info.value)

    def test_predict_invalid_elo_self_too_high(self, loaded_mock_model):
        """Test prediction with ELO above 1900 raises error."""
        with pytest.raises(InvalidRatingError) as exc_info:
            loaded_mock_model.predict(STARTING_FEN, 2000)

        assert "Rating must be between 1100 and 1900" in str(exc_info.value)

    def test_predict_checkmate_position(self, loaded_mock_model):
        """Test prediction returns empty list for checkmate position."""
        # This is a checkmate position where white has no legal moves
        predictions = loaded_mock_model.predict(CHECKMATE_FEN, 1500)
        assert predictions == []

    def test_predict_valid_elo_boundaries(self, loaded_mock_model):
        """Test prediction with ELO at valid boundaries (1100-1900)."""
        # Test ELO = 1100 (minimum)
        predictions = loaded_mock_model.predict(STARTING_FEN, 1100)
        assert len(predictions) > 0

        # Test ELO = 1900 (maximum)
        predictions = loaded_mock_model.predict(STARTING_FEN, 1900)
        assert len(predictions) > 0


class TestMaia2ModelEstimateRating:
    """Tests for rating estimation."""

    def test_estimate_rating_not_loaded(self, mock_model):
        """Test rating estimation fails when model not loaded."""
        moves = [(STARTING_FEN, "e2e4")]

        with pytest.raises(ModelNotLoadedError):
            mock_model.estimate_rating(moves)

    def test_estimate_rating_empty_moves(self, loaded_mock_model):
        """Test rating estimation with empty moves raises error."""
        with pytest.raises(ModelInferenceError) as exc_info:
            loaded_mock_model.estimate_rating([])

        assert "at least one move" in str(exc_info.value).lower()

    def test_estimate_rating_success(self, loaded_mock_model):
        """Test successful rating estimation."""
        moves = [
            (STARTING_FEN, "e2e4"),
            ("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "e7e5"),
        ]

        estimated, low, high = loaded_mock_model.estimate_rating(moves)

        # Check that values are reasonable
        assert 800 <= estimated <= 2400
        assert 800 <= low <= estimated
        assert estimated <= high <= 2400

    def test_estimate_rating_invalid_fen(self, loaded_mock_model):
        """Test rating estimation with invalid FEN raises error."""
        moves = [(INVALID_FEN, "e2e4")]

        with pytest.raises(InvalidFenError):
            loaded_mock_model.estimate_rating(moves)


class TestMaia2ModelShutdown:
    """Tests for model shutdown."""

    def test_shutdown(self, loaded_mock_model):
        """Test model shutdown."""
        assert loaded_mock_model.is_loaded is True
        loaded_mock_model.shutdown()
        assert loaded_mock_model.is_loaded is False

    def test_shutdown_not_loaded(self, mock_model):
        """Test shutdown when not loaded is safe."""
        assert mock_model.is_loaded is False
        mock_model.shutdown()  # Should not raise
        assert mock_model.is_loaded is False


class TestMovePrediction:
    """Tests for MovePrediction dataclass."""

    def test_move_prediction_creation(self):
        """Test MovePrediction creation."""
        pred = MovePrediction(move="e2e4", probability=0.35)
        assert pred.move == "e2e4"
        assert pred.probability == 0.35

    def test_move_prediction_equality(self):
        """Test MovePrediction equality."""
        pred1 = MovePrediction(move="e2e4", probability=0.35)
        pred2 = MovePrediction(move="e2e4", probability=0.35)
        assert pred1 == pred2


class TestExceptionHierarchy:
    """Tests for exception hierarchy."""

    def test_maia_error_is_base(self):
        """Test MaiaError is the base for Maia-specific exceptions."""
        assert issubclass(ModelLoadError, MaiaError)
        assert issubclass(ModelInferenceError, MaiaError)
        assert issubclass(InvalidRatingError, MaiaError)
        assert issubclass(ModelNotLoadedError, MaiaError)

    def test_invalid_fen_uses_chessbeast_base(self):
        """Test InvalidFenError uses ChessBeastError base (shared across services)."""
        from common import ChessBeastError

        assert issubclass(InvalidFenError, ChessBeastError)
        # InvalidFenError is NOT a subclass of MaiaError (it's shared)
        assert not issubclass(InvalidFenError, MaiaError)

    def test_can_catch_maia_exceptions_with_base(self):
        """Test Maia-specific exceptions can be caught with MaiaError."""
        for exc_class in [
            ModelLoadError,
            ModelInferenceError,
            InvalidRatingError,
            ModelNotLoadedError,
        ]:
            try:
                raise exc_class("test")
            except MaiaError:
                pass  # Should be caught

    def test_can_catch_invalid_fen_with_chessbeast_base(self):
        """Test InvalidFenError can be caught with ChessBeastError."""
        from common import ChessBeastError

        try:
            raise InvalidFenError("test")
        except ChessBeastError:
            pass  # Should be caught
