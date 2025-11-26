"""
Configuration for the Maia gRPC service.

All configuration can be set via environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass, field


@dataclass
class ModelConfig:
    """Configuration for the Maia2 model."""

    model_type: str = field(
        default_factory=lambda: os.environ.get("MAIA_MODEL_TYPE", "rapid")
    )
    device: str = field(default_factory=lambda: os.environ.get("MAIA_DEVICE", "cpu"))


@dataclass
class ServerConfig:
    """Configuration for the gRPC server."""

    port: int = field(default_factory=lambda: int(os.environ.get("GRPC_PORT", "50052")))
    max_workers: int = 10
    max_concurrent_rpcs: int = 100
