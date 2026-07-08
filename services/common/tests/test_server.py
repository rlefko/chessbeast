"""Tests for the GracefulServer lifecycle wrapper."""

import signal
import threading
from unittest.mock import MagicMock

from common import GracefulServer


def test_stop_sets_shutdown_event() -> None:
    """stop() programmatically triggers the shutdown event."""
    graceful = GracefulServer(MagicMock())
    assert not graceful._shutdown_event.is_set()
    graceful.stop()
    assert graceful._shutdown_event.is_set()


def test_stop_is_idempotent() -> None:
    """Calling stop() repeatedly is safe and leaves the event set."""
    graceful = GracefulServer(MagicMock())
    graceful.stop()
    graceful.stop()
    graceful.stop()
    assert graceful._shutdown_event.is_set()


def test_shutdown_handler_sets_event() -> None:
    """The signal handler sets the shutdown event so wait() can return."""
    graceful = GracefulServer(MagicMock())
    graceful._shutdown_handler(int(signal.SIGTERM), None)
    assert graceful._shutdown_event.is_set()


def test_wait_returns_after_stop_from_another_thread() -> None:
    """wait() blocks until stop() is called, then stops the server with the grace period."""
    server = MagicMock()
    graceful = GracefulServer(server, grace_period=0.25)

    waiter = threading.Thread(target=graceful.wait)
    waiter.start()
    graceful.stop()
    waiter.join(timeout=2.0)

    assert not waiter.is_alive(), "wait() did not return after stop()"
    server.stop.assert_called_once_with(grace=0.25)


def test_on_shutdown_callback_invoked_once_before_server_stop() -> None:
    """The on_shutdown callback runs exactly once during shutdown, before server.stop."""
    order: list[str] = []
    server = MagicMock()
    server.stop.side_effect = lambda grace: order.append("server_stop")
    graceful = GracefulServer(
        server, grace_period=0.1, on_shutdown=lambda: order.append("callback")
    )

    graceful.stop()
    graceful.wait()

    assert order == ["callback", "server_stop"]


def test_on_shutdown_exception_does_not_prevent_server_stop() -> None:
    """An on_shutdown callback that raises is swallowed and server.stop still runs."""

    def boom() -> None:
        raise RuntimeError("callback exploded")

    server = MagicMock()
    graceful = GracefulServer(server, on_shutdown=boom)

    graceful.stop()
    graceful.wait()  # Must not raise

    server.stop.assert_called_once()


def test_start_registers_handlers_and_wait_restores_them() -> None:
    """start() installs signal handlers; shutdown restores the original ones."""
    original_sigterm = signal.getsignal(signal.SIGTERM)
    original_sigint = signal.getsignal(signal.SIGINT)

    server = MagicMock()
    graceful = GracefulServer(server, grace_period=0.0)

    try:
        graceful.start()
        registered_sigterm = signal.getsignal(signal.SIGTERM)
        registered_sigint = signal.getsignal(signal.SIGINT)

        graceful.stop()
        graceful.wait()

        restored_sigterm = signal.getsignal(signal.SIGTERM)
        restored_sigint = signal.getsignal(signal.SIGINT)
    finally:
        # Safety net: never leave test-installed handlers behind
        signal.signal(signal.SIGTERM, original_sigterm)
        signal.signal(signal.SIGINT, original_sigint)

    server.start.assert_called_once()
    assert registered_sigterm == graceful._shutdown_handler
    assert registered_sigint == graceful._shutdown_handler
    assert restored_sigterm is original_sigterm
    assert restored_sigint is original_sigint


def test_wait_after_signal_handler_fires() -> None:
    """A signal-handler invocation unblocks a wait() running in another thread."""
    server = MagicMock()
    graceful = GracefulServer(server, grace_period=0.05)

    waiter = threading.Thread(target=graceful.wait)
    waiter.start()
    graceful._shutdown_handler(int(signal.SIGINT), None)
    waiter.join(timeout=2.0)

    assert not waiter.is_alive(), "wait() did not return after the signal handler fired"
    server.stop.assert_called_once_with(grace=0.05)
