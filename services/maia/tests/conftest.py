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
    """Mock the maia2 module for unit testing.

    Mocks the new maia2 API:
        from maia2.model import from_pretrained
        from maia2.inference import prepare, inference_each
        model = from_pretrained(type="blitz", device="cpu", save_root="./models")
        prepared = prepare()
        move_probs, win_prob = inference_each(model, prepared, fen, elo_self, elo_oppo)
    """
    import sys
    from types import ModuleType

    import chess

    class MockModel:
        """Mock model returned by from_pretrained."""

        def parameters(self):
            """Mock parameters() for device detection."""
            import torch

            return iter([torch.tensor([1.0])])

        def eval(self):
            """Mock eval mode."""
            pass

    def mock_from_pretrained(type: str, device: str, save_root: str = "./maia2_models"):
        """Mock from_pretrained function."""
        return MockModel()

    def mock_prepare():
        """Mock prepare function - returns utilities tuple."""
        return ({}, {}, {})  # all_moves_dict, elo_dict, all_moves_dict_reversed

    def mock_inference_each(
        model, prepared, fen: str, elo_self: int, elo_oppo: int
    ) -> tuple[dict[str, float], float]:
        """Mock inference_each - returns move probabilities and win probability."""
        board = chess.Board(fen)
        if not list(board.legal_moves):
            return {}, 0.5

        move_probs = {
            "e2e4": 0.35,
            "d2d4": 0.30,
            "g1f3": 0.15,
            "c2c4": 0.10,
            "e2e3": 0.05,
            "b1c3": 0.03,
            "g2g3": 0.02,
        }
        return move_probs, 0.5

    # Create mock maia2 package structure
    mock_maia2 = ModuleType("maia2")
    mock_maia2_model = ModuleType("maia2.model")
    mock_maia2_inference = ModuleType("maia2.inference")

    # Set up model module
    mock_maia2_model.from_pretrained = mock_from_pretrained

    # Set up inference module
    mock_maia2_inference.prepare = mock_prepare
    mock_maia2_inference.inference_each = mock_inference_each

    # Patch sys.modules
    sys.modules["maia2"] = mock_maia2
    sys.modules["maia2.model"] = mock_maia2_model
    sys.modules["maia2.inference"] = mock_maia2_inference

    yield mock_maia2

    # Cleanup
    for mod in ["maia2", "maia2.model", "maia2.inference"]:
        if mod in sys.modules:
            del sys.modules[mod]


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
