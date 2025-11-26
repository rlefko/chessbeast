"""Pytest configuration for Maia service tests."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Add the src directory to the Python path
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))


# Sample FEN positions for testing
STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
COMPLEX_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
SICILIAN_FEN = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2"
CHECKMATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
INVALID_FEN = "not-a-valid-fen"


@pytest.fixture
def model_config():
    """Create a test model configuration."""
    from maia_service.config import ModelConfig

    return ModelConfig(model_type="rapid", device="cpu")


@pytest.fixture
def server_config():
    """Create a test server configuration."""
    from maia_service.config import ServerConfig

    return ServerConfig(port=50052, max_workers=2)


@pytest.fixture
def mock_maia2_module(monkeypatch):
    """Mock the maia2 module for unit testing."""
    # Create mock modules
    mock_model_module = MagicMock()
    mock_inference_module = MagicMock()

    # Mock from_pretrained
    mock_model = MagicMock()
    mock_model_module.from_pretrained.return_value = mock_model

    # Mock prepare
    mock_prepared = MagicMock()
    mock_inference_module.prepare.return_value = mock_prepared

    # Mock inference_each - return realistic move probabilities
    def mock_inference_each(model, prepared, fen, elo_self, elo_opponent):
        # Return a dict of move -> probability
        move_probs = {
            "e2e4": 0.35,
            "d2d4": 0.30,
            "g1f3": 0.15,
            "c2c4": 0.10,
            "e2e3": 0.05,
            "b1c3": 0.03,
            "g2g3": 0.02,
        }
        win_prob = 0.5
        return move_probs, win_prob

    mock_inference_module.inference_each = mock_inference_each

    # Create mock maia2 module
    mock_maia2 = MagicMock()
    mock_maia2.model = mock_model_module
    mock_maia2.inference = mock_inference_module

    # Patch sys.modules
    import sys

    sys.modules["maia2"] = mock_maia2
    sys.modules["maia2.model"] = mock_model_module
    sys.modules["maia2.inference"] = mock_inference_module

    yield mock_maia2

    # Cleanup
    if "maia2" in sys.modules:
        del sys.modules["maia2"]
    if "maia2.model" in sys.modules:
        del sys.modules["maia2.model"]
    if "maia2.inference" in sys.modules:
        del sys.modules["maia2.inference"]


@pytest.fixture
def mock_model(mock_maia2_module, model_config):
    """Create a mock Maia2Model with mocked maia2 module."""
    from maia_service.model import Maia2Model

    model = Maia2Model(model_config)
    return model


@pytest.fixture
def loaded_mock_model(mock_model):
    """Create a loaded mock Maia2Model."""
    mock_model.load()
    yield mock_model
    mock_model.shutdown()


@pytest.fixture
def mock_context():
    """Create a mock gRPC ServicerContext."""
    context = MagicMock()
    context.abort = MagicMock(side_effect=Exception("gRPC abort"))
    return context
