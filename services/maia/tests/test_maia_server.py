"""Tests for the Maia gRPC server."""

from unittest.mock import MagicMock

import grpc
import pytest

from maia_service.config import ModelConfig, ServerConfig
from maia_service.generated import (
    EstimateRatingRequest,
    GameMove,
    HealthCheckRequest,
    PredictRequest,
)
from maia_service.model import (
    InvalidFenError,
    InvalidRatingError,
    Maia2Model,
    ModelInferenceError,
    ModelNotLoadedError,
    MovePrediction,
)
from maia_service.server import MaiaServiceImpl, create_server

# Sample FEN positions
STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
INVALID_FEN = "not-a-valid-fen"


class GrpcAbortError(Exception):
    """Custom exception for simulating gRPC abort in tests."""


class TestMaiaServiceImpl:
    """Tests for MaiaServiceImpl gRPC servicer."""

    @pytest.fixture
    def mock_model(self):
        """Create a mock Maia2Model for testing."""
        model = MagicMock(spec=Maia2Model)
        model.is_loaded = True
        return model

    @pytest.fixture
    def service(self, mock_model):
        """Create a MaiaServiceImpl with mocked model."""
        return MaiaServiceImpl(mock_model)

    @pytest.fixture
    def mock_context(self):
        """Create a mock gRPC ServicerContext."""
        context = MagicMock(spec=grpc.ServicerContext)
        context.abort = MagicMock(side_effect=GrpcAbortError("gRPC abort"))
        return context


class TestPredictMoves(TestMaiaServiceImpl):
    """Tests for PredictMoves RPC."""

    def test_predict_moves_success(self, service, mock_model, mock_context):
        """Test successful move prediction."""
        # Setup mock predictions
        mock_model.predict.return_value = [
            MovePrediction(move="e2e4", probability=0.35),
            MovePrediction(move="d2d4", probability=0.30),
            MovePrediction(move="g1f3", probability=0.15),
        ]

        request = PredictRequest(fen=STARTING_FEN, rating_band=1500)
        response = service.PredictMoves(request, mock_context)

        # Verify model was called correctly
        mock_model.predict.assert_called_once_with(
            fen=STARTING_FEN,
            elo_self=1500,
            top_k=5,
        )

        # Verify response
        assert len(response.predictions) == 3
        assert response.predictions[0].move == "e2e4"
        assert response.predictions[0].probability == pytest.approx(0.35)
        assert response.predictions[1].move == "d2d4"
        assert response.predictions[2].move == "g1f3"

    def test_predict_moves_invalid_fen(self, service, mock_model, mock_context):
        """Test prediction with invalid FEN aborts with INVALID_ARGUMENT."""
        mock_model.predict.side_effect = InvalidFenError("Invalid FEN: test")

        request = PredictRequest(fen=INVALID_FEN, rating_band=1500)

        with pytest.raises(GrpcAbortError):
            service.PredictMoves(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.INVALID_ARGUMENT

    def test_predict_moves_invalid_rating(self, service, mock_model, mock_context):
        """Test prediction with invalid rating aborts with INVALID_ARGUMENT."""
        mock_model.predict.side_effect = InvalidRatingError("Invalid rating")

        request = PredictRequest(fen=STARTING_FEN, rating_band=5000)

        with pytest.raises(GrpcAbortError):
            service.PredictMoves(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.INVALID_ARGUMENT

    def test_predict_moves_model_not_loaded(self, service, mock_model, mock_context):
        """Test prediction when model not loaded aborts with UNAVAILABLE."""
        mock_model.predict.side_effect = ModelNotLoadedError("Model not loaded")

        request = PredictRequest(fen=STARTING_FEN, rating_band=1500)

        with pytest.raises(GrpcAbortError):
            service.PredictMoves(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.UNAVAILABLE

    def test_predict_moves_inference_error(self, service, mock_model, mock_context):
        """Test prediction inference error aborts with INTERNAL."""
        mock_model.predict.side_effect = ModelInferenceError("Inference failed")

        request = PredictRequest(fen=STARTING_FEN, rating_band=1500)

        with pytest.raises(GrpcAbortError):
            service.PredictMoves(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.INTERNAL


class TestEstimateRating(TestMaiaServiceImpl):
    """Tests for EstimateRating RPC."""

    def test_estimate_rating_success(self, service, mock_model, mock_context):
        """Test successful rating estimation."""
        mock_model.estimate_rating.return_value = (1500, 1300, 1700)

        moves = [
            GameMove(fen=STARTING_FEN, played_move="e2e4"),
            GameMove(
                fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                played_move="e7e5",
            ),
        ]
        request = EstimateRatingRequest(moves=moves)
        response = service.EstimateRating(request, mock_context)

        # Verify model was called
        mock_model.estimate_rating.assert_called_once()
        call_args = mock_model.estimate_rating.call_args[0][0]
        assert len(call_args) == 2
        assert call_args[0] == (STARTING_FEN, "e2e4")

        # Verify response
        assert response.estimated_rating == 1500
        assert response.confidence_low == 1300
        assert response.confidence_high == 1700

    def test_estimate_rating_no_moves(self, service, mock_model, mock_context):
        """Test rating estimation with no moves aborts with INVALID_ARGUMENT."""
        request = EstimateRatingRequest(moves=[])

        with pytest.raises(GrpcAbortError):
            service.EstimateRating(request, mock_context)

        # Check first abort call (may be followed by generic handler due to mock raising)
        assert mock_context.abort.call_count >= 1
        first_call = mock_context.abort.call_args_list[0]
        assert first_call[0][0] == grpc.StatusCode.INVALID_ARGUMENT
        assert "at least one move" in first_call[0][1].lower()

    def test_estimate_rating_invalid_fen(self, service, mock_model, mock_context):
        """Test rating estimation with invalid FEN aborts with INVALID_ARGUMENT."""
        mock_model.estimate_rating.side_effect = InvalidFenError("Invalid FEN")

        moves = [GameMove(fen=INVALID_FEN, played_move="e2e4")]
        request = EstimateRatingRequest(moves=moves)

        with pytest.raises(GrpcAbortError):
            service.EstimateRating(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.INVALID_ARGUMENT

    def test_estimate_rating_model_not_loaded(self, service, mock_model, mock_context):
        """Test rating estimation when model not loaded aborts with UNAVAILABLE."""
        mock_model.estimate_rating.side_effect = ModelNotLoadedError("Model not loaded")

        moves = [GameMove(fen=STARTING_FEN, played_move="e2e4")]
        request = EstimateRatingRequest(moves=moves)

        with pytest.raises(GrpcAbortError):
            service.EstimateRating(request, mock_context)

        mock_context.abort.assert_called_once()
        args = mock_context.abort.call_args
        assert args[0][0] == grpc.StatusCode.UNAVAILABLE


class TestHealthCheck(TestMaiaServiceImpl):
    """Tests for HealthCheck RPC."""

    def test_health_check_healthy(self, service, mock_model, mock_context):
        """Test health check when model is loaded."""
        mock_model.is_loaded = True

        request = HealthCheckRequest()
        response = service.HealthCheck(request, mock_context)

        assert response.healthy is True
        assert list(response.loaded_models) == [1]

    def test_health_check_unhealthy(self, service, mock_model, mock_context):
        """Test health check when model is not loaded."""
        mock_model.is_loaded = False

        request = HealthCheckRequest()
        response = service.HealthCheck(request, mock_context)

        assert response.healthy is False
        assert list(response.loaded_models) == []


class TestCreateServer:
    """Tests for create_server function."""

    def test_create_server_returns_server_and_model(self, mock_maia2_module):
        """Test that create_server returns a server and model."""
        server, model = create_server()

        assert server is not None
        assert isinstance(model, Maia2Model)

    def test_create_server_with_custom_config(self, mock_maia2_module):
        """Test create_server with custom configuration."""
        server_config = ServerConfig(port=50055, max_workers=4)
        model_config = ModelConfig(model_type="blitz", device="cpu")

        server, model = create_server(server_config, model_config)

        assert model.model_type == "blitz"
        assert model.device == "cpu"

        # Clean up
        server.stop(grace=0)


class TestServerConfig:
    """Tests for ServerConfig."""

    def test_default_config(self):
        """Test default ServerConfig values."""
        config = ServerConfig()
        assert config.port == 50052
        assert config.max_workers == 10
        assert config.max_concurrent_rpcs == 100

    def test_custom_config(self):
        """Test custom ServerConfig values."""
        config = ServerConfig(port=50055, max_workers=4, max_concurrent_rpcs=50)
        assert config.port == 50055
        assert config.max_workers == 4
        assert config.max_concurrent_rpcs == 50


class TestModelConfig:
    """Tests for ModelConfig."""

    def test_default_config(self):
        """Test default ModelConfig values."""
        config = ModelConfig()
        assert config.model_type == "blitz"
        assert config.device == "cpu"

    def test_custom_config(self):
        """Test custom ModelConfig values."""
        config = ModelConfig(model_type="blitz", device="cuda")
        assert config.model_type == "blitz"
        assert config.device == "cuda"
