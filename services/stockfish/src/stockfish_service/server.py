"""
Stockfish gRPC Server

Implements the StockfishService gRPC interface for chess position evaluation.
"""

import logging
from concurrent import futures

import grpc

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_PORT = 50051
MAX_WORKERS = 10


def serve(port: int = DEFAULT_PORT) -> None:
    """Start the Stockfish gRPC server."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=MAX_WORKERS))

    # TODO: Add StockfishServiceServicer once proto stubs are generated
    # stockfish_pb2_grpc.add_StockfishServiceServicer_to_server(
    #     StockfishServiceServicer(), server
    # )

    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"Stockfish gRPC server started on port {port}")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
