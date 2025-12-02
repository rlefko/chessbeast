"""ChessBeast common utilities for Python services."""

from .exceptions import (
    ChessBeastError,
    EngineError,
    EngineStartupError,
    EngineTimeoutError,
    EvalNotAvailableError,
    InvalidFenError,
    MaiaError,
    ModelLoadError,
    ModelInferenceError,
    ModelNotLoadedError,
    InvalidRatingError,
)
from .grpc_errors import grpc_error_handler, map_exception_to_grpc_status
from .server import GracefulServer

__all__ = [
    # Exceptions
    "ChessBeastError",
    "EngineError",
    "EngineStartupError",
    "EngineTimeoutError",
    "EvalNotAvailableError",
    "InvalidFenError",
    "MaiaError",
    "ModelLoadError",
    "ModelInferenceError",
    "ModelNotLoadedError",
    "InvalidRatingError",
    # gRPC utilities
    "grpc_error_handler",
    "map_exception_to_grpc_status",
    # Server utilities
    "GracefulServer",
]
