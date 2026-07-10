"""Pytest configuration for Stockfish service tests.

Shared fixtures (FEN positions, engine availability, mock_simple_engine)
live in services/conftest.py.
"""

import pytest

from stockfish_service.config import EngineConfig, PoolConfig


@pytest.fixture
def engine_config() -> EngineConfig:
    """Create a test engine configuration."""
    return EngineConfig(threads=1, hash_mb=16)


@pytest.fixture
def pool_config() -> PoolConfig:
    """Create a test pool configuration."""
    return PoolConfig(size=2, acquire_timeout=5.0)
