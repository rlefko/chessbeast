"""
Stockfish gRPC Service for ChessBeast

This service wraps the Stockfish chess engine and exposes it via gRPC
for position evaluation and analysis.
"""

from .config import EngineConfig, PoolConfig, ServerConfig
from .engine import (
    EngineError,
    EngineStartupError,
    EngineTimeoutError,
    EvaluationResult,
    InvalidFenError,
    StockfishEngine,
)
from .pool import EnginePool, PoolExhaustedError, PoolShutdownError
from .server import StockfishServiceImpl, create_server, serve

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Config
    "EngineConfig",
    "PoolConfig",
    "ServerConfig",
    # Engine
    "StockfishEngine",
    "EvaluationResult",
    "EngineError",
    "EngineStartupError",
    "EngineTimeoutError",
    "InvalidFenError",
    # Pool
    "EnginePool",
    "PoolExhaustedError",
    "PoolShutdownError",
    # Server
    "StockfishServiceImpl",
    "create_server",
    "serve",
]
