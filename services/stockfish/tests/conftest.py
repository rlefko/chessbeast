"""Pytest configuration for Stockfish service tests."""

import os
import shutil
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Add the src directory to the Python path
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))


# Sample FEN positions for testing
STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MATE_IN_1_FEN = "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1"  # Re1-e8#
COMPLEX_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"


@pytest.fixture
def stockfish_available() -> bool:
    """Check if Stockfish binary is available."""
    stockfish_path = os.environ.get("STOCKFISH_PATH", "stockfish")
    return shutil.which(stockfish_path) is not None


@pytest.fixture
def engine_config():
    """Create a test engine configuration."""
    from stockfish_service.config import EngineConfig

    return EngineConfig(threads=1, hash_mb=16)


@pytest.fixture
def pool_config():
    """Create a test pool configuration."""
    from stockfish_service.config import PoolConfig

    return PoolConfig(size=2, acquire_timeout=5.0)


@pytest.fixture
def mock_simple_engine(monkeypatch):
    """Create a mocked python-chess SimpleEngine."""
    import chess.engine

    mock_engine = MagicMock()
    mock_engine.id = {"name": "Stockfish 16 Mock"}
    mock_engine.protocol.returncode = None

    # Mock popen_uci to return our mock engine
    monkeypatch.setattr(
        chess.engine.SimpleEngine,
        "popen_uci",
        lambda *args, **kwargs: mock_engine,
    )

    return mock_engine
