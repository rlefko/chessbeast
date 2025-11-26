"""
Generated gRPC stubs for Maia service.

Run `make build-protos` to regenerate these files from the proto definitions.
"""

from .maia_pb2 import (
    EstimateRatingRequest,
    EstimateRatingResponse,
    GameMove,
    HealthCheckRequest,
    HealthCheckResponse,
    MovePrediction,
    PredictRequest,
    PredictResponse,
)
from .maia_pb2_grpc import (
    MaiaServiceServicer,
    MaiaServiceStub,
    add_MaiaServiceServicer_to_server,
)

__all__ = [
    "EstimateRatingRequest",
    "EstimateRatingResponse",
    "GameMove",
    "HealthCheckRequest",
    "HealthCheckResponse",
    "MovePrediction",
    "PredictRequest",
    "PredictResponse",
    "MaiaServiceServicer",
    "MaiaServiceStub",
    "add_MaiaServiceServicer_to_server",
]
