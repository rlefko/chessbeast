"""
gRPC error handling utilities.

Provides a decorator and mapping functions to convert Python exceptions
to appropriate gRPC status codes, eliminating duplicated try/except blocks.
"""

from __future__ import annotations

import functools
import logging
from typing import TYPE_CHECKING, Any, Callable, TypeVar

import grpc

from .exceptions import (
    EngineError,
    EngineTimeoutError,
    EngineUnavailableError,
    EvalNotAvailableError,
    InvalidFenError,
    InvalidRatingError,
    MaiaError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
    PoolExhaustedError,
    PoolShutdownError,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


# Exception to gRPC status mapping
EXCEPTION_STATUS_MAP: list[tuple[type[Exception], grpc.StatusCode, str]] = [
    # Argument errors
    (InvalidFenError, grpc.StatusCode.INVALID_ARGUMENT, "Invalid FEN"),
    (InvalidRatingError, grpc.StatusCode.INVALID_ARGUMENT, "Invalid rating"),
    # Pool errors
    (PoolExhaustedError, grpc.StatusCode.RESOURCE_EXHAUSTED, "Pool exhausted"),
    (PoolShutdownError, grpc.StatusCode.UNAVAILABLE, "Pool shutdown"),
    # Unavailable errors
    (EngineUnavailableError, grpc.StatusCode.UNAVAILABLE, "Engine unavailable"),
    (ModelNotLoadedError, grpc.StatusCode.UNAVAILABLE, "Model not loaded"),
    (ModelLoadError, grpc.StatusCode.UNAVAILABLE, "Model load failed"),
    # Timeout errors
    (EngineTimeoutError, grpc.StatusCode.DEADLINE_EXCEEDED, "Engine timeout"),
    # Unimplemented
    (EvalNotAvailableError, grpc.StatusCode.UNIMPLEMENTED, "Eval not available"),
    # Internal errors (order matters - base classes last)
    (ModelInferenceError, grpc.StatusCode.INTERNAL, "Inference error"),
    (MaiaError, grpc.StatusCode.INTERNAL, "Maia error"),
    (EngineError, grpc.StatusCode.INTERNAL, "Engine error"),
]


def map_exception_to_grpc_status(
    exc: Exception,
) -> tuple[grpc.StatusCode, str]:
    """Map an exception to its corresponding gRPC status code and message.

    Args:
        exc: The exception to map.

    Returns:
        Tuple of (status_code, log_prefix).
    """
    for exc_type, status, prefix in EXCEPTION_STATUS_MAP:
        if isinstance(exc, exc_type):
            return status, prefix
    return grpc.StatusCode.INTERNAL, "Internal error"


def grpc_error_handler(
    default_response: Callable[[], Any] | None = None,
) -> Callable[[F], F]:
    """Decorator to handle exceptions in gRPC service methods.

    Catches ChessBeast exceptions and maps them to appropriate gRPC status codes,
    logging the error and aborting the context.

    Args:
        default_response: Optional factory function to create a default response
                         (needed for type checker, since context.abort doesn't return).

    Returns:
        Decorated function that handles exceptions appropriately.

    Example:
        @grpc_error_handler(default_response=lambda: EvaluateResponse())
        def Evaluate(self, request, context):
            # ... implementation that may raise exceptions ...
            return response
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(
            self: Any,
            request: Any,
            context: grpc.ServicerContext,
            *args: Any,
            **kwargs: Any,
        ) -> Any:
            try:
                return func(self, request, context, *args, **kwargs)
            except Exception as e:
                status, prefix = map_exception_to_grpc_status(e)

                # Log with appropriate level based on severity
                if status == grpc.StatusCode.INTERNAL:
                    logger.exception(f"{prefix}: {e}")
                else:
                    logger.warning(f"{prefix}: {e}")

                context.abort(status, str(e))

                # This is never reached, but helps type checker
                if default_response is not None:
                    return default_response()
                return None

        return wrapper  # type: ignore[return-value]

    return decorator
