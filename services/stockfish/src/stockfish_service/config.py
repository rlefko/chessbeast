"""
Configuration for the Stockfish gRPC service.

All configuration can be set via environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class EngineConfig:
    """Configuration for a single Stockfish engine instance."""

    stockfish_path: Path = field(
        default_factory=lambda: Path(os.environ.get("STOCKFISH_PATH", "stockfish"))
    )
    threads: int = field(default_factory=lambda: int(os.environ.get("STOCKFISH_THREADS", "8")))
    hash_mb: int = field(default_factory=lambda: int(os.environ.get("STOCKFISH_HASH", "2048")))
    startup_timeout: float = 5.0  # seconds to wait for UCI init


@dataclass
class PoolConfig:
    """Configuration for the engine connection pool."""

    size: int = field(default_factory=lambda: int(os.environ.get("STOCKFISH_POOL_SIZE", "2")))
    acquire_timeout: float = 30.0  # seconds to wait for an available engine
    max_retries: int = 3  # retries for failed engines before giving up


@dataclass
class ServerConfig:
    """Configuration for the gRPC server."""

    port: int = field(default_factory=lambda: int(os.environ.get("GRPC_PORT", "50051")))
    max_workers: int = 10
    max_concurrent_rpcs: int = 100
