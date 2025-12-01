"""
Configuration for the Stockfish 16 classical eval gRPC service.

This is a separate service from the main Stockfish service, optimized for
the `eval` command which extracts classical evaluation breakdown.

Note: This config is intentionally separate from the main stockfish service
to allow independent deployment and configuration. The SF16 service has
different resource requirements (lower threads/hash since eval doesn't search).
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Stockfish16Config:
    """
    Complete configuration for the SF16 classical eval service.

    Unlike the main Stockfish service which does deep searches,
    SF16 only runs the `eval` command which is fast and doesn't
    benefit from high thread counts or large hash tables.
    """

    # Engine binary path (must be SF16 or earlier for classical eval)
    engine_path: Path = field(
        default_factory=lambda: Path(os.environ.get("STOCKFISH16_PATH", "stockfish"))
    )

    # Engine resources (lower than main service - eval doesn't need them)
    engine_threads: int = field(
        default_factory=lambda: int(os.environ.get("STOCKFISH16_THREADS", "1"))
    )
    engine_hash_mb: int = field(
        default_factory=lambda: int(os.environ.get("STOCKFISH16_HASH", "128"))
    )
    engine_startup_timeout: float = 5.0

    # Pool settings (smaller pool - eval is infrequent)
    pool_size: int = field(
        default_factory=lambda: int(os.environ.get("STOCKFISH16_POOL_SIZE", "1"))
    )
    pool_acquire_timeout: float = 30.0
    pool_max_retries: int = 3

    # Server settings
    grpc_port: int = field(default_factory=lambda: int(os.environ.get("STOCKFISH16_PORT", "50053")))
    grpc_max_workers: int = 4
    grpc_max_concurrent_rpcs: int = 20
