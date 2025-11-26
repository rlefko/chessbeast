"""
Maia gRPC Service for ChessBeast

This service wraps the Maia2 chess model (NeurIPS 2024) and exposes it via gRPC
for human-likeness prediction and rating estimation.
"""

from .config import ModelConfig, ServerConfig
from .model import (
    InvalidFenError,
    InvalidRatingError,
    Maia2Model,
    MaiaError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
    MovePrediction,
)
from .server import MaiaServiceImpl, create_server, serve

__version__ = "0.1.0"

__all__ = [
    # Config
    "ModelConfig",
    "ServerConfig",
    # Model
    "Maia2Model",
    "MovePrediction",
    # Errors
    "MaiaError",
    "ModelLoadError",
    "ModelInferenceError",
    "InvalidFenError",
    "InvalidRatingError",
    "ModelNotLoadedError",
    # Server
    "MaiaServiceImpl",
    "create_server",
    "serve",
]
