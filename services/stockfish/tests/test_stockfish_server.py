"""
Unit tests for the Stockfish gRPC server.
"""

from unittest.mock import MagicMock

import grpc
import pytest

from conftest import STARTING_FEN
from stockfish_service.config import EngineConfig, PoolConfig, ServerConfig
from stockfish_service.engine import (
    EngineError,
    EngineTimeoutError,
    EvaluationResult,
    InvalidFenError,
)
from stockfish_service.generated import (
    EvaluateRequest,
    HealthCheckRequest,
)
from stockfish_service.pool import EnginePool, PoolExhaustedError, PoolShutdownError
from stockfish_service.server import StockfishServiceImpl, create_server


class TestStockfishServiceImpl:
    """Tests for the gRPC service implementation."""

    @pytest.fixture
    def mock_pool(self) -> MagicMock:
        """Create a mock engine pool."""
        pool = MagicMock(spec=EnginePool)
        return pool

    @pytest.fixture
    def mock_engine(self) -> MagicMock:
        """Create a mock engine."""
        engine = MagicMock()
        return engine

    @pytest.fixture
    def mock_context(self) -> MagicMock:
        """Create a mock gRPC context."""
        context = MagicMock(spec=grpc.ServicerContext)
        return context

    @pytest.fixture
    def servicer(self, mock_pool: MagicMock) -> StockfishServiceImpl:
        """Create service with mock pool."""
        return StockfishServiceImpl(mock_pool)

    def test_evaluate_success(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_engine: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate returns correct response on success."""
        mock_engine.evaluate.return_value = EvaluationResult(
            cp=25,
            mate=0,
            depth=20,
            best_line=["e2e4", "e7e5"],
            alternatives=[],
        )
        mock_pool.engine.return_value.__enter__ = MagicMock(return_value=mock_engine)
        mock_pool.engine.return_value.__exit__ = MagicMock(return_value=False)

        request = EvaluateRequest(fen=STARTING_FEN, depth=20)
        response = servicer.Evaluate(request, mock_context)

        assert response.cp == 25
        assert response.mate == 0
        assert response.depth == 20
        assert list(response.best_line) == ["e2e4", "e7e5"]
        mock_context.abort.assert_not_called()

    def test_evaluate_with_multipv(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_engine: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate returns alternatives for MultiPV."""
        mock_engine.evaluate.return_value = EvaluationResult(
            cp=30,
            mate=0,
            depth=16,
            best_line=["e2e4"],
            alternatives=[
                EvaluationResult(cp=25, mate=0, depth=16, best_line=["d2d4"]),
                EvaluationResult(cp=20, mate=0, depth=16, best_line=["c2c4"]),
            ],
        )
        mock_pool.engine.return_value.__enter__ = MagicMock(return_value=mock_engine)
        mock_pool.engine.return_value.__exit__ = MagicMock(return_value=False)

        request = EvaluateRequest(fen=STARTING_FEN, depth=16, multipv=3)
        response = servicer.Evaluate(request, mock_context)

        assert response.cp == 30
        assert len(response.alternatives) == 2
        assert response.alternatives[0].cp == 25
        assert response.alternatives[1].cp == 20

    def test_evaluate_invalid_fen(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_engine: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate aborts with INVALID_ARGUMENT for bad FEN."""
        mock_engine.evaluate.side_effect = InvalidFenError("Invalid FEN")
        mock_pool.engine.return_value.__enter__ = MagicMock(return_value=mock_engine)
        mock_pool.engine.return_value.__exit__ = MagicMock(return_value=False)

        request = EvaluateRequest(fen="invalid", depth=10)
        servicer.Evaluate(request, mock_context)

        mock_context.abort.assert_called_once()
        call_args = mock_context.abort.call_args
        assert call_args[0][0] == grpc.StatusCode.INVALID_ARGUMENT

    def test_evaluate_pool_exhausted(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate aborts with RESOURCE_EXHAUSTED when pool is full."""
        mock_pool.engine.return_value.__enter__ = MagicMock(
            side_effect=PoolExhaustedError("timeout")
        )

        request = EvaluateRequest(fen=STARTING_FEN, depth=10)
        servicer.Evaluate(request, mock_context)

        mock_context.abort.assert_called_once()
        call_args = mock_context.abort.call_args
        assert call_args[0][0] == grpc.StatusCode.RESOURCE_EXHAUSTED

    def test_evaluate_pool_shutdown(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate aborts with UNAVAILABLE when pool is shut down."""
        mock_pool.engine.return_value.__enter__ = MagicMock(
            side_effect=PoolShutdownError("shutdown")
        )

        request = EvaluateRequest(fen=STARTING_FEN, depth=10)
        servicer.Evaluate(request, mock_context)

        mock_context.abort.assert_called_once()
        call_args = mock_context.abort.call_args
        assert call_args[0][0] == grpc.StatusCode.UNAVAILABLE

    def test_evaluate_engine_timeout(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_engine: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate aborts with DEADLINE_EXCEEDED on timeout."""
        mock_engine.evaluate.side_effect = EngineTimeoutError("timeout")
        mock_pool.engine.return_value.__enter__ = MagicMock(return_value=mock_engine)
        mock_pool.engine.return_value.__exit__ = MagicMock(return_value=False)

        request = EvaluateRequest(fen=STARTING_FEN, depth=10)
        servicer.Evaluate(request, mock_context)

        mock_context.abort.assert_called_once()
        call_args = mock_context.abort.call_args
        assert call_args[0][0] == grpc.StatusCode.DEADLINE_EXCEEDED

    def test_evaluate_engine_error(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_engine: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Evaluate aborts with INTERNAL on engine error."""
        mock_engine.evaluate.side_effect = EngineError("crash")
        mock_pool.engine.return_value.__enter__ = MagicMock(return_value=mock_engine)
        mock_pool.engine.return_value.__exit__ = MagicMock(return_value=False)

        request = EvaluateRequest(fen=STARTING_FEN, depth=10)
        servicer.Evaluate(request, mock_context)

        mock_context.abort.assert_called_once()
        call_args = mock_context.abort.call_args
        assert call_args[0][0] == grpc.StatusCode.INTERNAL

    def test_health_check_healthy(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Health check returns healthy status."""
        mock_pool.health_check.return_value = {
            "total": 4,
            "available": 4,
            "healthy": 4,
            "version": "Stockfish 16",
        }

        request = HealthCheckRequest()
        response = servicer.HealthCheck(request, mock_context)

        assert response.healthy is True
        assert response.version == "Stockfish 16"

    def test_health_check_unhealthy(
        self,
        servicer: StockfishServiceImpl,
        mock_pool: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Health check returns unhealthy when no healthy engines."""
        mock_pool.health_check.return_value = {
            "total": 4,
            "available": 0,
            "healthy": 0,
            "version": "Stockfish 16",
        }

        request = HealthCheckRequest()
        response = servicer.HealthCheck(request, mock_context)

        assert response.healthy is False


class TestCreateServer:
    """Tests for server creation."""

    def test_create_server_with_defaults(self, mock_simple_engine: MagicMock) -> None:
        """Server can be created with default config."""
        server, pool = create_server()

        assert server is not None
        assert pool is not None
        assert not pool.is_started

    def test_create_server_with_custom_config(
        self, mock_simple_engine: MagicMock
    ) -> None:
        """Server can be created with custom config."""
        server_config = ServerConfig(port=50052, max_workers=5)
        pool_config = PoolConfig(size=2)
        engine_config = EngineConfig(threads=2)

        server, pool = create_server(server_config, pool_config, engine_config)

        assert server is not None
        assert pool is not None
        assert pool.size == 2
