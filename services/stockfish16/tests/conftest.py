"""Pytest configuration for Stockfish 16 service tests."""

import os
import shutil
import sys
from pathlib import Path

import pytest

# Add the src directory to the Python path
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))


# Sample FEN positions for testing
STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
COMPLEX_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"


@pytest.fixture
def starting_fen() -> str:
    """Starting position FEN."""
    return STARTING_FEN


@pytest.fixture
def complex_fen() -> str:
    """Complex position FEN."""
    return COMPLEX_FEN


# Sample SF16 eval output for testing the parser
SAMPLE_EVAL_OUTPUT = """
      Term    |    White    |    Black    |    Total
              |   MG    EG  |   MG    EG  |   MG    EG
------------------------------------------------------
    Material |  +4.12 +4.50|  -4.12 -4.50|  +0.00 +0.00
   Imbalance |  +0.02 -0.00|  -0.02 +0.00|  +0.00 +0.00
     Pawns   |  +0.00 +0.00|  -0.12 -0.08|  -0.12 -0.08
     Knights |  -0.15 +0.22|  +0.00 +0.00|  -0.15 +0.22
     Bishops |  +0.00 +0.00|  +0.00 +0.00|  +0.00 +0.00
       Rooks |  +0.00 +0.00|  +0.00 +0.00|  +0.00 +0.00
      Queens |  +0.00 +0.00|  +0.00 +0.00|  +0.00 +0.00
    Mobility |  +0.45 +0.31|  -0.00 -0.00|  +0.45 +0.31
 King safety |  +0.18 -0.04|  +0.00 +0.00|  +0.18 -0.04
     Threats |  +0.12 +0.00|  -0.00 -0.00|  +0.12 +0.00
      Passed |  +0.00 +0.00|  +0.00 +0.00|  +0.00 +0.00
       Space |  +0.08 +0.00|  -0.00 -0.00|  +0.08 +0.00
    Winnable |             |             |  +0.00 +0.00
------------------------------------------------------
       Total |             |             |  +0.56 +0.41
""".strip().split("\n")


@pytest.fixture
def stockfish16_available() -> bool:
    """Check if Stockfish 16 binary is available."""
    sf16_path = os.environ.get("STOCKFISH16_PATH", "stockfish")
    return shutil.which(sf16_path) is not None


@pytest.fixture
def config():
    """Create a test configuration."""
    from stockfish16_service.config import Stockfish16Config

    return Stockfish16Config(
        engine_threads=1,
        engine_hash_mb=16,
        pool_size=1,
    )


@pytest.fixture
def sample_eval_lines():
    """Sample eval output lines for parser testing."""
    return SAMPLE_EVAL_OUTPUT
