"""Pytest configuration for Stockfish 16 service tests.

Shared fixtures (FEN positions, engine availability) live in services/conftest.py.
"""

import pytest

from stockfish16_service.config import Stockfish16Config

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
def config() -> Stockfish16Config:
    """Create a test configuration."""
    return Stockfish16Config(
        engine_threads=1,
        engine_hash_mb=16,
        pool_size=1,
    )


@pytest.fixture
def sample_eval_lines() -> list[str]:
    """Sample eval output lines for parser testing."""
    return SAMPLE_EVAL_OUTPUT
