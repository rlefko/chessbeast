"""
Stockfish 16 Classical Eval gRPC Server

Implements the Stockfish16Service gRPC interface for extracting
classical evaluation breakdown from chess positions.
"""

from __future__ import annotations

import logging
import os
from concurrent import futures
from typing import TYPE_CHECKING

import grpc
from common import GracefulServer, grpc_error_handler

from .config import Stockfish16Config
from .pool import Stockfish16Manager

if TYPE_CHECKING:
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import generated stubs - these are created by build-protos.sh
try:
    from .generated.stockfish16_pb2 import (
        ClassicalEvalRequest,
        ClassicalEvalResponse,
        HealthCheckRequest,
        HealthCheckResponse,
        PhaseScore,
        SideBreakdown,
    )
    from .generated.stockfish16_pb2_grpc import (
        Stockfish16ServiceServicer,
        add_Stockfish16ServiceServicer_to_server,
    )

    STUBS_AVAILABLE = True
except ImportError:
    logger.warning("gRPC stubs not generated. Run `make build-protos` first.")
    STUBS_AVAILABLE = False

    # Define placeholder types for type checking
    class ClassicalEvalRequest:  # type: ignore[no-redef]
        fen: str

    class ClassicalEvalResponse:  # type: ignore[no-redef]
        pass

    class HealthCheckRequest:  # type: ignore[no-redef]
        pass

    class HealthCheckResponse:  # type: ignore[no-redef]
        pass

    class Stockfish16ServiceServicer:  # type: ignore[no-redef]
        pass

    def add_Stockfish16ServiceServicer_to_server(servicer: object, server: object) -> None:  # type: ignore[misc]
        pass


def _to_proto_phase_score(mg: float, eg: float) -> PhaseScore:
    """Convert phase scores to proto message."""
    return PhaseScore(mg=mg, eg=eg)


def _to_proto_side_breakdown(
    white_mg: float,
    white_eg: float,
    black_mg: float,
    black_eg: float,
    total_mg: float,
    total_eg: float,
) -> SideBreakdown:
    """Convert side breakdown to proto message."""
    return SideBreakdown(
        white=_to_proto_phase_score(white_mg, white_eg),
        black=_to_proto_phase_score(black_mg, black_eg),
        total=_to_proto_phase_score(total_mg, total_eg),
    )


def _build_classical_eval_response(result: "ClassicalEvalResult") -> ClassicalEvalResponse:
    """Build proto response from ClassicalEvalResult."""
    from .engine import ClassicalEvalResult  # noqa: F811
    
    return ClassicalEvalResponse(
        material=_to_proto_side_breakdown(
            result.material.white.mg, result.material.white.eg,
            result.material.black.mg, result.material.black.eg,
            result.material.total.mg, result.material.total.eg,
        ),
        imbalance=_to_proto_side_breakdown(
            result.imbalance.white.mg, result.imbalance.white.eg,
            result.imbalance.black.mg, result.imbalance.black.eg,
            result.imbalance.total.mg, result.imbalance.total.eg,
        ),
        pawns=_to_proto_side_breakdown(
            result.pawns.white.mg, result.pawns.white.eg,
            result.pawns.black.mg, result.pawns.black.eg,
            result.pawns.total.mg, result.pawns.total.eg,
        ),
        knights=_to_proto_side_breakdown(
            result.knights.white.mg, result.knights.white.eg,
            result.knights.black.mg, result.knights.black.eg,
            result.knights.total.mg, result.knights.total.eg,
        ),
        bishops=_to_proto_side_breakdown(
            result.bishops.white.mg, result.bishops.white.eg,
            result.bishops.black.mg, result.bishops.black.eg,
            result.bishops.total.mg, result.bishops.total.eg,
        ),
        rooks=_to_proto_side_breakdown(
            result.rooks.white.mg, result.rooks.white.eg,
            result.rooks.black.mg, result.rooks.black.eg,
            result.rooks.total.mg, result.rooks.total.eg,
        ),
        queens=_to_proto_side_breakdown(
            result.queens.white.mg, result.queens.white.eg,
            result.queens.black.mg, result.queens.black.eg,
            result.queens.total.mg, result.queens.total.eg,
        ),
        mobility=_to_proto_side_breakdown(
            result.mobility.white.mg, result.mobility.white.eg,
            result.mobility.black.mg, result.mobility.black.eg,
            result.mobility.total.mg, result.mobility.total.eg,
        ),
        king_safety=_to_proto_side_breakdown(
            result.king_safety.white.mg, result.king_safety.white.eg,
            result.king_safety.black.mg, result.king_safety.black.eg,
            result.king_safety.total.mg, result.king_safety.total.eg,
        ),
        threats=_to_proto_side_breakdown(
            result.threats.white.mg, result.threats.white.eg,
            result.threats.black.mg, result.threats.black.eg,
            result.threats.total.mg, result.threats.total.eg,
        ),
        passed=_to_proto_side_breakdown(
            result.passed.white.mg, result.passed.white.eg,
            result.passed.black.mg, result.passed.black.eg,
            result.passed.total.mg, result.passed.total.eg,
        ),
        space=_to_proto_side_breakdown(
            result.space.white.mg, result.space.white.eg,
            result.space.black.mg, result.space.black.eg,
            result.space.total.mg, result.space.total.eg,
        ),
        winnable=_to_proto_side_breakdown(
            result.winnable.white.mg, result.winnable.white.eg,
            result.winnable.black.mg, result.winnable.black.eg,
            result.winnable.total.mg, result.winnable.total.eg,
        ),
        total=_to_proto_side_breakdown(
            result.total.white.mg, result.total.white.eg,
            result.total.black.mg, result.total.black.eg,
            result.total.total.mg, result.total.total.eg,
        ),
        final_eval_cp=result.final_eval_cp,
    )


class Stockfish16ServiceImpl(Stockfish16ServiceServicer):
    """gRPC service implementation for SF16 classical evaluation."""

    def __init__(self, manager: Stockfish16Manager) -> None:
        """Initialize the service with an engine manager."""
        self._manager = manager

    @grpc_error_handler(default_response=lambda: ClassicalEvalResponse())
    def GetClassicalEval(
        self,
        request: ClassicalEvalRequest,
        context: grpc.ServicerContext,
    ) -> ClassicalEvalResponse:
        """Get classical evaluation breakdown for a position."""
        logger.debug(f"GetClassicalEval request: fen={request.fen}")

        result = self._manager.get_classical_eval(request.fen)
        return _build_classical_eval_response(result)

    def HealthCheck(
        self,
        request: HealthCheckRequest,
        context: grpc.ServicerContext,
    ) -> HealthCheckResponse:
        """Health check endpoint."""
        health = self._manager.health_check()

        return HealthCheckResponse(
            healthy=health["healthy"],
            version=health["version"],
        )


def create_server(
    config: Stockfish16Config | None = None,
) -> tuple[grpc.Server, Stockfish16Manager]:
    """Create and configure the gRPC server with engine manager."""
    if not STUBS_AVAILABLE:
        raise RuntimeError("gRPC stubs not generated. Run `make build-protos` first.")

    config = config or Stockfish16Config()

    # Create manager
    manager = Stockfish16Manager(config)

    # Create server
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=config.grpc_max_workers),
        maximum_concurrent_rpcs=config.grpc_max_concurrent_rpcs,
    )

    # Add service
    servicer = Stockfish16ServiceImpl(manager)
    add_Stockfish16ServiceServicer_to_server(servicer, server)  # type: ignore[no-untyped-call]

    server.add_insecure_port(f"[::]:{config.grpc_port}")

    return server, manager


def serve(config: Stockfish16Config | None = None) -> None:
    """Start the SF16 gRPC server (blocking)."""
    config = config or Stockfish16Config()

    server, manager = create_server(config)

    # Start manager first
    manager.start()

    # Use GracefulServer for proper signal handling
    graceful = GracefulServer(server, on_shutdown=manager.shutdown)
    graceful.start()

    logger.info(f"Stockfish 16 gRPC server started on port {config.grpc_port}")

    # Wait for shutdown signal
    graceful.wait()


if __name__ == "__main__":
    port = int(os.environ.get("STOCKFISH16_PORT", "50053"))
    serve(Stockfish16Config(grpc_port=port))
