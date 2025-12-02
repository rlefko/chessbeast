"""
Server lifecycle utilities for gRPC services.

Provides GracefulServer class with proper signal handling to fix the critical
bug where shutdown_event was never initialized to threading.Event().

CRITICAL BUG FIXED:
Before (broken):
    shutdown_event = None  # NEVER SET TO Event()
    def shutdown_handler(signum, frame):
        if shutdown_event is not None:  # Always False!
            shutdown_event.set()

After (fixed):
    class GracefulServer:
        def __init__(self):
            self._shutdown_event = threading.Event()  # Properly initialized!
"""

from __future__ import annotations

import logging
import signal
import threading
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    import grpc

logger = logging.getLogger(__name__)


class GracefulServer:
    """Wrapper for gRPC servers with proper graceful shutdown.

    Handles SIGTERM and SIGINT signals to trigger graceful shutdown,
    fixing the bug where shutdown_event was never initialized.

    Usage:
        server, resource = create_server(config)
        resource.start()  # Start pools, load models, etc.

        graceful = GracefulServer(server)
        graceful.start()

        logger.info(f"Server started on port {config.port}")
        graceful.wait()  # Blocks until shutdown signal

        # Cleanup
        resource.shutdown()
    """

    def __init__(
        self,
        server: grpc.Server,
        grace_period: float = 5.0,
        on_shutdown: Callable[[], None] | None = None,
    ) -> None:
        """Initialize the graceful server wrapper.

        Args:
            server: The gRPC server instance.
            grace_period: Seconds to wait for in-flight RPCs during shutdown.
            on_shutdown: Optional callback to run during shutdown (before server.stop).
        """
        self._server = server
        self._grace_period = grace_period
        self._on_shutdown = on_shutdown
        # CRITICAL: Initialize the event here, not as None!
        self._shutdown_event = threading.Event()
        self._original_sigterm: Any = None
        self._original_sigint: Any = None

    def _shutdown_handler(self, signum: int, frame: object) -> None:
        """Signal handler for graceful shutdown."""
        sig_name = signal.Signals(signum).name
        logger.info(f"Received {sig_name}, initiating graceful shutdown...")
        self._shutdown_event.set()

    def start(self) -> None:
        """Start the server and register signal handlers."""
        # Register signal handlers
        self._original_sigterm = signal.signal(signal.SIGTERM, self._shutdown_handler)
        self._original_sigint = signal.signal(signal.SIGINT, self._shutdown_handler)

        # Start the gRPC server
        self._server.start()

    def wait(self) -> None:
        """Wait for shutdown signal and perform graceful shutdown.

        This method blocks until a SIGTERM or SIGINT is received,
        then performs graceful shutdown.
        """
        try:
            # Wait for shutdown signal
            self._shutdown_event.wait()
        except KeyboardInterrupt:
            # Handle Ctrl+C during wait
            logger.info("Keyboard interrupt received")

        # Perform shutdown
        self._do_shutdown()

    def _do_shutdown(self) -> None:
        """Perform the actual shutdown sequence."""
        logger.info("Shutting down...")

        # Run custom shutdown callback if provided
        if self._on_shutdown is not None:
            try:
                self._on_shutdown()
            except Exception as e:
                logger.exception(f"Error in shutdown callback: {e}")

        # Stop server with grace period
        self._server.stop(grace=self._grace_period)

        # Restore original signal handlers
        if self._original_sigterm is not None:
            signal.signal(signal.SIGTERM, self._original_sigterm)
        if self._original_sigint is not None:
            signal.signal(signal.SIGINT, self._original_sigint)

        logger.info("Shutdown complete")

    def stop(self) -> None:
        """Programmatically trigger shutdown (for testing)."""
        self._shutdown_event.set()
