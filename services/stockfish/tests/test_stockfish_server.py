"""
Tests for the Stockfish gRPC server.
"""

import pytest


def test_placeholder() -> None:
    """Placeholder test to verify pytest is working."""
    assert True


@pytest.mark.skip(reason="Server implementation pending proto generation")
def test_server_starts() -> None:
    """Test that the server can be instantiated."""
    # TODO: Implement once proto stubs are generated
    pass
