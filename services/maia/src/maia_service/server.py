"""
Maia gRPC Server

Implements the MaiaService gRPC interface for human-likeness prediction.
"""

from __future__ import annotations

import logging
import os
import signal
from concurrent import futures
from typing import TYPE_CHECKING

import grpc

from .config import ModelConfig, ServerConfig
from .generated import (
    EstimateRatingRequest,
    EstimateRatingResponse,
    HealthCheckRequest,
    HealthCheckResponse,
    MaiaServiceServicer,
    MovePrediction,
    PredictRequest,
    PredictResponse,
    add_MaiaServiceServicer_to_server,
)
from .model import (
    InvalidFenError,
    InvalidRatingError,
    Maia2Model,
    MaiaError,
    ModelInferenceError,
    ModelNotLoadedError,
)

if TYPE_CHECKING:
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MaiaServiceImpl(MaiaServiceServicer):
    """gRPC service implementation for Maia human-likeness prediction."""

    def __init__(self, model: Maia2Model) -> None:
        """Initialize the service with a Maia2 model.

        Args:
            model: Maia2 model instance to use for predictions.
        """
        self._model = model

    def PredictMoves(
        self,
        request: PredictRequest,
        context: grpc.ServicerContext,
    ) -> PredictResponse:
        """Predict the most likely human moves for a position.

        Args:
            request: The prediction request with FEN and rating.
            context: gRPC service context.

        Returns:
            PredictResponse with move predictions.
        """
        logger.debug(f"PredictMoves request: fen={request.fen}, rating={request.rating_band}")

        try:
            predictions = self._model.predict(
                fen=request.fen,
                elo_self=request.rating_band,
                top_k=5,
            )

            # Convert to proto response
            response = PredictResponse()
            for pred in predictions:
                response.predictions.append(
                    MovePrediction(move=pred.move, probability=pred.probability)
                )

            return response

        except InvalidFenError as e:
            logger.warning(f"Invalid FEN: {e}")
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(e))
        except InvalidRatingError as e:
            logger.warning(f"Invalid rating: {e}")
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(e))
        except ModelNotLoadedError as e:
            logger.warning(f"Model not loaded: {e}")
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
        except ModelInferenceError as e:
            logger.error(f"Inference error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, str(e))
        except MaiaError as e:
            logger.error(f"Maia error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, str(e))
        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, f"Internal error: {e}")

        # This line is never reached due to context.abort, but needed for type checker
        return PredictResponse()

    def EstimateRating(
        self,
        request: EstimateRatingRequest,
        context: grpc.ServicerContext,
    ) -> EstimateRatingResponse:
        """Estimate player rating from a sequence of moves.

        Args:
            request: The rating estimation request with moves.
            context: gRPC service context.

        Returns:
            EstimateRatingResponse with rating estimate and confidence bounds.
        """
        logger.debug(f"EstimateRating request: {len(request.moves)} moves")

        try:
            # Convert proto moves to tuples
            moves = [(m.fen, m.played_move) for m in request.moves]

            # Validate we have moves
            if not moves:
                context.abort(
                    grpc.StatusCode.INVALID_ARGUMENT,
                    "At least one move is required for rating estimation",
                )

            estimated, low, high = self._model.estimate_rating(moves)

            return EstimateRatingResponse(
                estimated_rating=estimated,
                confidence_low=low,
                confidence_high=high,
            )

        except InvalidFenError as e:
            logger.warning(f"Invalid FEN: {e}")
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(e))
        except ModelNotLoadedError as e:
            logger.warning(f"Model not loaded: {e}")
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
        except ModelInferenceError as e:
            logger.error(f"Inference error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, str(e))
        except MaiaError as e:
            logger.error(f"Maia error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, str(e))
        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, f"Internal error: {e}")

        # This line is never reached due to context.abort, but needed for type checker
        return EstimateRatingResponse()

    def HealthCheck(
        self,
        request: HealthCheckRequest,
        context: grpc.ServicerContext,
    ) -> HealthCheckResponse:
        """Health check endpoint.

        Args:
            request: Empty health check request.
            context: gRPC service context.

        Returns:
            HealthCheckResponse with model health status.
        """
        healthy = self._model.is_loaded

        # Return 1 as loaded model indicator for Maia2 (single unified model)
        loaded_models = [1] if healthy else []

        return HealthCheckResponse(
            healthy=healthy,
            loaded_models=loaded_models,
        )


def create_server(
    server_config: ServerConfig | None = None,
    model_config: ModelConfig | None = None,
) -> tuple[grpc.Server, Maia2Model]:
    """Create and configure the gRPC server with Maia2 model.

    Args:
        server_config: Server configuration.
        model_config: Model configuration.

    Returns:
        Tuple of (server, model). Caller should load model, then start server.
    """
    server_config = server_config or ServerConfig()
    model_config = model_config or ModelConfig()

    # Create model
    model = Maia2Model(model_config)

    # Create server
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=server_config.max_workers),
        maximum_concurrent_rpcs=server_config.max_concurrent_rpcs,
    )

    # Add service
    servicer = MaiaServiceImpl(model)
    add_MaiaServiceServicer_to_server(servicer, server)  # type: ignore[no-untyped-call]

    server.add_insecure_port(f"[::]:{server_config.port}")

    return server, model


def serve(
    server_config: ServerConfig | None = None,
    model_config: ModelConfig | None = None,
) -> None:
    """Start the Maia gRPC server (blocking).

    Args:
        server_config: Server configuration.
        model_config: Model configuration.
    """
    server_config = server_config or ServerConfig()

    server, model = create_server(server_config, model_config)

    # Load model first
    model.load()

    # Start server
    server.start()
    logger.info(f"Maia gRPC server started on port {server_config.port}")

    # Handle shutdown signals
    shutdown_event = None

    def shutdown_handler(signum: int, frame: object) -> None:
        nonlocal shutdown_event
        logger.info(f"Received signal {signum}, shutting down...")
        if shutdown_event is not None:
            shutdown_event.set()

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("Shutting down...")
        server.stop(grace=5)
        model.shutdown()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    port = int(os.environ.get("GRPC_PORT", "50052"))
    serve(ServerConfig(port=port))
