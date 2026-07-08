"""Tests for exception-to-gRPC-status mapping and the grpc_error_handler decorator."""

from typing import Any

import grpc
import pytest

from common import (
    ChessBeastError,
    EngineError,
    EngineStartupError,
    EngineTimeoutError,
    EngineUnavailableError,
    EvalNotAvailableError,
    InvalidFenError,
    InvalidRatingError,
    MaiaError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
    PoolExhaustedError,
    PoolShutdownError,
    grpc_error_handler,
    map_exception_to_grpc_status,
)


class StubAbortError(Exception):
    """Raised by the stub context to mimic grpc.ServicerContext.abort semantics."""


class StubContext:
    """Minimal stand-in for grpc.ServicerContext that records abort calls."""

    def __init__(self, abort_raises: bool = True) -> None:
        """Create a stub context; abort_raises mirrors real gRPC abort behavior."""
        self.abort_calls: list[tuple[grpc.StatusCode, str]] = []
        self._abort_raises = abort_raises

    def abort(self, code: grpc.StatusCode, details: str) -> None:
        """Record the abort call and optionally raise like the real context."""
        self.abort_calls.append((code, details))
        if self._abort_raises:
            raise StubAbortError(code, details)


# =============================================================================
# map_exception_to_grpc_status
# =============================================================================


@pytest.mark.parametrize(
    ("exc", "expected_code", "expected_prefix"),
    [
        (InvalidFenError("bad"), grpc.StatusCode.INVALID_ARGUMENT, "Invalid FEN"),
        (InvalidRatingError("bad"), grpc.StatusCode.INVALID_ARGUMENT, "Invalid rating"),
        (PoolExhaustedError("full"), grpc.StatusCode.RESOURCE_EXHAUSTED, "Pool exhausted"),
        (PoolShutdownError("down"), grpc.StatusCode.UNAVAILABLE, "Pool shutdown"),
        (EngineUnavailableError("gone"), grpc.StatusCode.UNAVAILABLE, "Engine unavailable"),
        (ModelNotLoadedError("cold"), grpc.StatusCode.UNAVAILABLE, "Model not loaded"),
        (ModelLoadError("broken"), grpc.StatusCode.UNAVAILABLE, "Model load failed"),
        (EngineTimeoutError("slow"), grpc.StatusCode.DEADLINE_EXCEEDED, "Engine timeout"),
        (EvalNotAvailableError("nnue"), grpc.StatusCode.UNIMPLEMENTED, "Eval not available"),
        (ModelInferenceError("nan"), grpc.StatusCode.INTERNAL, "Inference error"),
        (MaiaError("misc"), grpc.StatusCode.INTERNAL, "Maia error"),
        (EngineError("misc"), grpc.StatusCode.INTERNAL, "Engine error"),
    ],
)
def test_mapping_table(
    exc: Exception, expected_code: grpc.StatusCode, expected_prefix: str
) -> None:
    """Each mapped exception type resolves to its dedicated status code and prefix."""
    code, prefix = map_exception_to_grpc_status(exc)
    assert code == expected_code
    assert prefix == expected_prefix


@pytest.mark.parametrize(
    ("exc", "expected_code"),
    [
        (EngineTimeoutError("slow"), grpc.StatusCode.DEADLINE_EXCEEDED),
        (PoolExhaustedError("full"), grpc.StatusCode.RESOURCE_EXHAUSTED),
        (PoolShutdownError("down"), grpc.StatusCode.UNAVAILABLE),
        (ModelInferenceError("nan"), grpc.StatusCode.INTERNAL),
    ],
)
def test_subclasses_match_before_their_base_classes(
    exc: Exception, expected_code: grpc.StatusCode
) -> None:
    """Base-class-last ordering: subclasses map to their specific code, not the base's."""
    code, prefix = map_exception_to_grpc_status(exc)
    assert code == expected_code
    # Never the generic base-class prefixes for these subclasses
    if not isinstance(exc, ModelInferenceError):
        assert prefix not in ("Engine error", "Maia error", "Internal error")
    else:
        assert prefix == "Inference error"


def test_unmapped_engine_subclass_falls_back_to_engine_error() -> None:
    """EngineStartupError has no dedicated entry and maps via the EngineError base."""
    code, prefix = map_exception_to_grpc_status(EngineStartupError("no binary"))
    assert code == grpc.StatusCode.INTERNAL
    assert prefix == "Engine error"


def test_bare_chessbeast_error_maps_to_internal() -> None:
    """A bare ChessBeastError has no entry in the map and falls through to INTERNAL."""
    code, prefix = map_exception_to_grpc_status(ChessBeastError("generic"))
    assert code == grpc.StatusCode.INTERNAL
    assert prefix == "Internal error"


@pytest.mark.parametrize("exc", [ValueError("v"), RuntimeError("r"), KeyError("k")])
def test_unknown_exception_maps_to_internal(exc: Exception) -> None:
    """Exceptions outside the hierarchy map to INTERNAL with the generic prefix."""
    code, prefix = map_exception_to_grpc_status(exc)
    assert code == grpc.StatusCode.INTERNAL
    assert prefix == "Internal error"


# =============================================================================
# grpc_error_handler decorator
# =============================================================================


class FakeServicer:
    """Servicer whose methods raise configurable exceptions for decorator tests."""

    def __init__(self, error: Exception | None = None) -> None:
        """Store the exception to raise (None means succeed)."""
        self._error = error

    @grpc_error_handler()
    def evaluate(self, request: Any, context: Any) -> str:
        """Raise the configured error or return a success marker."""
        if self._error is not None:
            raise self._error
        return "ok"

    @grpc_error_handler(default_response=lambda: "default")
    def evaluate_with_default(self, request: Any, context: Any) -> str:
        """Raise the configured error or return a success marker."""
        if self._error is not None:
            raise self._error
        return "ok"


def test_decorator_success_path_passes_through() -> None:
    """When the wrapped method succeeds, its result is returned and abort is not called."""
    context = StubContext()
    result = FakeServicer().evaluate(request=object(), context=context)
    assert result == "ok"
    assert context.abort_calls == []


def test_decorator_aborts_context_with_mapped_status() -> None:
    """The decorator calls context.abort with the mapped code and the exception message."""
    context = StubContext()
    servicer = FakeServicer(error=InvalidFenError("Invalid FEN: xyz"))

    # A real gRPC context.abort raises to terminate the RPC; that propagates.
    with pytest.raises(StubAbortError):
        servicer.evaluate(request=object(), context=context)

    assert context.abort_calls == [(grpc.StatusCode.INVALID_ARGUMENT, "Invalid FEN: xyz")]


def test_decorator_maps_timeout_to_deadline_exceeded() -> None:
    """An EngineTimeoutError aborts with DEADLINE_EXCEEDED, not the base INTERNAL."""
    context = StubContext()
    servicer = FakeServicer(error=EngineTimeoutError("too slow"))

    with pytest.raises(StubAbortError):
        servicer.evaluate(request=object(), context=context)

    assert context.abort_calls == [(grpc.StatusCode.DEADLINE_EXCEEDED, "too slow")]


def test_decorator_maps_unknown_exception_to_internal() -> None:
    """Non-ChessBeast exceptions abort with INTERNAL."""
    context = StubContext()
    servicer = FakeServicer(error=RuntimeError("surprise"))

    with pytest.raises(StubAbortError):
        servicer.evaluate(request=object(), context=context)

    assert context.abort_calls == [(grpc.StatusCode.INTERNAL, "surprise")]


def test_decorator_returns_default_response_when_abort_does_not_raise() -> None:
    """With a non-raising abort stub, the default_response factory result is returned."""
    context = StubContext(abort_raises=False)
    servicer = FakeServicer(error=PoolExhaustedError("full"))

    result = servicer.evaluate_with_default(request=object(), context=context)

    assert result == "default"
    assert context.abort_calls == [(grpc.StatusCode.RESOURCE_EXHAUSTED, "full")]


def test_decorator_returns_none_without_default_response() -> None:
    """With a non-raising abort stub and no factory, the wrapper returns None."""
    context = StubContext(abort_raises=False)
    servicer = FakeServicer(error=PoolShutdownError("down"))

    result = servicer.evaluate(request=object(), context=context)

    assert result is None
    assert context.abort_calls == [(grpc.StatusCode.UNAVAILABLE, "down")]


def test_decorator_preserves_function_metadata() -> None:
    """functools.wraps keeps the wrapped method's name and docstring."""
    assert FakeServicer.evaluate.__name__ == "evaluate"
    assert FakeServicer.evaluate.__doc__ is not None
    assert "success marker" in FakeServicer.evaluate.__doc__
