"""
Generated gRPC stubs for Stockfish service.

Run `make build-protos` to regenerate these files from the proto definitions.
"""

from .stockfish_pb2 import (
    EvaluateRequest,
    EvaluateResponse,
    HealthCheckRequest,
    HealthCheckResponse,
)
from .stockfish_pb2_grpc import (
    StockfishServiceServicer,
    StockfishServiceStub,
    add_StockfishServiceServicer_to_server,
)

__all__ = [
    "EvaluateRequest",
    "EvaluateResponse",
    "HealthCheckRequest",
    "HealthCheckResponse",
    "StockfishServiceServicer",
    "StockfishServiceStub",
    "add_StockfishServiceServicer_to_server",
]
