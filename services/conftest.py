"""Shared pytest configuration for all services."""

import os
import shutil
from unittest.mock import MagicMock

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires external dependencies)"
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip integration tests unless --integration flag is passed."""
    run_integration = config.getoption("--integration", default=False)
    if not run_integration:
        skip_integration = pytest.mark.skip(reason="need --integration option to run")
        for item in items:
            if "integration" in item.keywords:
                item.add_marker(skip_integration)


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add custom command line options."""
    parser.addoption(
        "--integration",
        action="store_true",
        default=False,
        help="run integration tests (requires external dependencies)",
    )


# =============================================================================
# Shared FEN fixtures
# =============================================================================

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MATE_IN_1_FEN = "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1"  # Re1-e8#
COMPLEX_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"


@pytest.fixture
def starting_fen() -> str:
    """Starting position FEN."""
    return STARTING_FEN


@pytest.fixture
def mate_in_1_fen() -> str:
    """Mate in 1 position FEN."""
    return MATE_IN_1_FEN


@pytest.fixture
def complex_fen() -> str:
    """Complex position FEN."""
    return COMPLEX_FEN


# =============================================================================
# Engine availability helper
# =============================================================================


def engine_binary_available(env_var: str, default: str = "stockfish") -> bool:
    """Check whether an engine binary configured via env_var is on PATH."""
    binary_path = os.environ.get(env_var, default)
    return shutil.which(binary_path) is not None


@pytest.fixture
def stockfish_available() -> bool:
    """Check if Stockfish binary is available."""
    return engine_binary_available("STOCKFISH_PATH")


@pytest.fixture
def stockfish16_available() -> bool:
    """Check if Stockfish 16 binary is available."""
    return engine_binary_available("STOCKFISH16_PATH")


# =============================================================================
# Mock engine fixtures
# =============================================================================


@pytest.fixture
def mock_simple_engine(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Create a mocked python-chess SimpleEngine."""
    import chess.engine

    mock_engine = MagicMock()
    mock_engine.id = {"name": "Stockfish 16 Mock"}
    mock_engine.protocol.returncode = None
    # Mock transport.get_returncode() for is_alive() check
    mock_engine.protocol.transport.get_returncode.return_value = None

    # Mock popen_uci to return our mock engine
    monkeypatch.setattr(
        chess.engine.SimpleEngine,
        "popen_uci",
        lambda *_args, **_kwargs: mock_engine,
    )

    return mock_engine
