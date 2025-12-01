"""
Stockfish gRPC Server

Implements the StockfishService gRPC interface for chess position evaluation.
"""

from __future__ import annotations

import logging
import os
import signal
from concurrent import futures
from typing import TYPE_CHECKING

import grpc

from .config import EngineConfig, PoolConfig, ServerConfig
from .engine import EngineError, EngineTimeoutError, InvalidFenError
from .generated import (
    EvaluateRequest,
    EvaluateResponse,
    HealthCheckRequest,
    HealthCheckResponse,
    StockfishServiceServicer,
    add_StockfishServiceServicer_to_server,
)
from .pool import EnginePool, PoolExhaustedError, PoolShutdownError

if TYPE_CHECKING:
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StockfishServiceImpl(StockfishServiceServicer):
    """gRPC service implementation for Stockfish position evaluation."""

    def __init__(self, pool: EnginePool) -> None:
        """Initialize the service with an engine pool.

        Args:
            pool: Engine pool to use for evaluations.
        """
        self._pool = pool

    def Evaluate(
        self,
        request: EvaluateRequest,
        context: grpc.ServicerContext,
    ) -> EvaluateResponse:
        """Evaluate a chess position.

        Args:
            request: The evaluation request with FEN and parameters.
            context: gRPC service context.

        Returns:
            EvaluateResponse with evaluation results.
        """
        logger.debug(f"Evaluate request: fen={request.fen}, depth={request.depth}")

        try:
            with self._pool.engine() as engine:
                result = engine.evaluate(
                    fen=request.fen,
                    depth=request.depth if request.depth > 0 else None,
                    time_ms=request.time_limit_ms if request.time_limit_ms > 0 else None,
                    nodes=request.nodes if request.nodes > 0 else None,
                    multipv=request.multipv if request.multipv > 0 else 1,
                    mate_min_time_ms=request.mate_min_time_ms
                    if request.mate_min_time_ms > 0
                    else None,
                )

                # Build response
                response = EvaluateResponse(
                    cp=result.cp,
                    mate=result.mate,
                    depth=result.depth,
                    best_line=result.best_line,
                )

                # Add alternatives for MultiPV
                for alt in result.alternatives:
                    response.alternatives.append(
                        EvaluateResponse(
                            cp=alt.cp,
                            mate=alt.mate,
                            depth=alt.depth,
                            best_line=alt.best_line,
                        )
                    )

                return response

        except InvalidFenError as e:
            logger.warning(f"Invalid FEN: {e}")
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(e))
        except PoolExhaustedError as e:
            logger.warning(f"Pool exhausted: {e}")
            context.abort(grpc.StatusCode.RESOURCE_EXHAUSTED, str(e))
        except PoolShutdownError as e:
            logger.warning(f"Pool shutdown: {e}")
            context.abort(grpc.StatusCode.UNAVAILABLE, str(e))
        except EngineTimeoutError as e:
            logger.warning(f"Engine timeout: {e}")
            context.abort(grpc.StatusCode.DEADLINE_EXCEEDED, str(e))
        except EngineError as e:
            logger.error(f"Engine error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, str(e))
        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, f"Internal error: {e}")

        # This line is never reached due to context.abort, but needed for type checker
        return EvaluateResponse()

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
            HealthCheckResponse with pool health status.
        """
        health = self._pool.health_check()

        return HealthCheckResponse(
            healthy=health["healthy"] > 0,
            version=health["version"],
        )


def create_server(
    server_config: ServerConfig | None = None,
    pool_config: PoolConfig | None = None,
    engine_config: EngineConfig | None = None,
) -> tuple[grpc.Server, EnginePool]:
    """Create and configure the gRPC server with engine pool.

    Args:
        server_config: Server configuration.
        pool_config: Pool configuration.
        engine_config: Engine configuration.

    Returns:
        Tuple of (server, pool). Caller should start pool, then server.
    """
    server_config = server_config or ServerConfig()
    pool_config = pool_config or PoolConfig()
    engine_config = engine_config or EngineConfig()

    # Create pool
    pool = EnginePool(pool_config, engine_config)

    # Create server
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=server_config.max_workers),
        maximum_concurrent_rpcs=server_config.max_concurrent_rpcs,
    )

    # Add service
    servicer = StockfishServiceImpl(pool)
    add_StockfishServiceServicer_to_server(servicer, server)  # type: ignore[no-untyped-call]

    server.add_insecure_port(f"[::]:{server_config.port}")

    return server, pool


def serve(
    server_config: ServerConfig | None = None,
    pool_config: PoolConfig | None = None,
    engine_config: EngineConfig | None = None,
) -> None:
    """Start the Stockfish gRPC server (blocking).

    Args:
        server_config: Server configuration.
        pool_config: Pool configuration.
        engine_config: Engine configuration.
    """
    server_config = server_config or ServerConfig()

    server, pool = create_server(server_config, pool_config, engine_config)

    # Start pool first
    pool.start()

    # Start server
    server.start()
    logger.info(f"Stockfish gRPC server started on port {server_config.port}")

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
        pool.shutdown()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    port = int(os.environ.get("GRPC_PORT", "50051"))
    serve(ServerConfig(port=port))
