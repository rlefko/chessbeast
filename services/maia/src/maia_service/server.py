"""
Maia gRPC Server

Implements the MaiaService gRPC interface for human-likeness prediction.
"""

import logging
from concurrent import futures

import grpc

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_PORT = 50052
MAX_WORKERS = 10


def serve(port: int = DEFAULT_PORT) -> None:
    """Start the Maia gRPC server."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=MAX_WORKERS))

    # TODO: Add MaiaServiceServicer once proto stubs are generated
    # maia_pb2_grpc.add_MaiaServiceServicer_to_server(
    #     MaiaServiceServicer(), server
    # )

    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"Maia gRPC server started on port {port}")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
