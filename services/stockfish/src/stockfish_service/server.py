"""
Stockfish gRPC Server

Implements the StockfishService gRPC interface for chess position evaluation.
"""

from __future__ import annotations

import logging
import os
from concurrent import futures
from typing import TYPE_CHECKING

import grpc

from common import GracefulServer, grpc_error_handler

from .config import EngineConfig, PoolConfig, ServerConfig
from .generated import (
    EvaluateRequest,
    EvaluateResponse,
    HealthCheckRequest,
    HealthCheckResponse,
    StockfishServiceServicer,
    add_StockfishServiceServicer_to_server,
)
from .pool import EnginePool

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

    @grpc_error_handler(default_response=lambda: EvaluateResponse())
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

        with self._pool.engine() as engine:
            result = engine.evaluate(
                fen=request.fen,
                depth=request.depth if request.depth > 0 else None,
                time_ms=request.time_limit_ms if request.time_limit_ms > 0 else None,
                nodes=request.nodes if request.nodes > 0 else None,
                multipv=request.multipv if request.multipv > 0 else 1,
                mate_min_time_ms=request.mate_min_time_ms if request.mate_min_time_ms > 0 else None,
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

    # Use GracefulServer for proper signal handling (fixes shutdown_event bug)
    graceful = GracefulServer(server, on_shutdown=pool.shutdown)
    graceful.start()

    logger.info(f"Stockfish gRPC server started on port {server_config.port}")

    # Wait for shutdown signal
    graceful.wait()


if __name__ == "__main__":
    port = int(os.environ.get("STOCKFISH_PORT", "50051"))
    serve(ServerConfig(port=port))
