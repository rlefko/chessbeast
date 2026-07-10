"""Tests for the unified ChessBeast exception hierarchy."""

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
)

ENGINE_EXCEPTIONS = [
    EngineStartupError,
    EngineTimeoutError,
    EvalNotAvailableError,
    EngineUnavailableError,
    PoolExhaustedError,
    PoolShutdownError,
]

MAIA_EXCEPTIONS = [
    ModelLoadError,
    ModelInferenceError,
    ModelNotLoadedError,
    InvalidRatingError,
]


@pytest.mark.parametrize("exc_type", ENGINE_EXCEPTIONS)
def test_engine_exceptions_subclass_engine_error(exc_type: type[Exception]) -> None:
    """Every engine exception is an EngineError, ChessBeastError, and Exception."""
    assert issubclass(exc_type, EngineError)
    assert issubclass(exc_type, ChessBeastError)
    assert issubclass(exc_type, Exception)


@pytest.mark.parametrize("exc_type", MAIA_EXCEPTIONS)
def test_maia_exceptions_subclass_maia_error(exc_type: type[Exception]) -> None:
    """Every Maia exception is a MaiaError, ChessBeastError, and Exception."""
    assert issubclass(exc_type, MaiaError)
    assert issubclass(exc_type, ChessBeastError)
    assert issubclass(exc_type, Exception)


def test_base_classes_subclass_chessbeast_error() -> None:
    """Branch base classes hang off ChessBeastError, which is an Exception."""
    assert issubclass(EngineError, ChessBeastError)
    assert issubclass(MaiaError, ChessBeastError)
    assert issubclass(InvalidFenError, ChessBeastError)
    assert issubclass(ChessBeastError, Exception)


@pytest.mark.parametrize("exc_type", ENGINE_EXCEPTIONS)
def test_engine_exceptions_are_not_maia_errors(exc_type: type[Exception]) -> None:
    """Engine branch exceptions must not leak into the Maia branch."""
    assert not issubclass(exc_type, MaiaError)


@pytest.mark.parametrize("exc_type", MAIA_EXCEPTIONS)
def test_maia_exceptions_are_not_engine_errors(exc_type: type[Exception]) -> None:
    """Maia branch exceptions must not leak into the Engine branch."""
    assert not issubclass(exc_type, EngineError)


def test_invalid_fen_error_is_branch_neutral() -> None:
    """InvalidFenError is shared across services and belongs to neither branch."""
    assert not issubclass(InvalidFenError, EngineError)
    assert not issubclass(InvalidFenError, MaiaError)


def test_pool_exhausted_instance_caught_as_bases() -> None:
    """A PoolExhaustedError instance is catchable via each of its base classes."""
    exc = PoolExhaustedError("No engine available within 0.1s timeout")
    assert isinstance(exc, PoolExhaustedError)
    assert isinstance(exc, EngineError)
    assert isinstance(exc, ChessBeastError)

    with pytest.raises(ChessBeastError):
        raise PoolExhaustedError("nope")

    with pytest.raises(EngineError):
        raise PoolExhaustedError("nope")


@pytest.mark.parametrize(
    "exc_type",
    [ChessBeastError, InvalidFenError, *ENGINE_EXCEPTIONS, *MAIA_EXCEPTIONS],
)
def test_message_round_trips_through_str(exc_type: type[Exception]) -> None:
    """str() of any hierarchy exception preserves the constructor message."""
    message = "detailed failure context: 42"
    assert str(exc_type(message)) == message


def test_message_formatting_without_args() -> None:
    """An exception constructed with no args stringifies to the empty string."""
    assert str(ChessBeastError()) == ""
    assert str(PoolShutdownError()) == ""


def test_exception_chaining_preserves_cause() -> None:
    """Raising a hierarchy exception from another keeps the original as __cause__."""
    original = ValueError("bad fen")
    with pytest.raises(InvalidFenError) as exc_info:
        raise InvalidFenError("Invalid FEN: xyz") from original
    assert exc_info.value.__cause__ is original
    assert str(exc_info.value) == "Invalid FEN: xyz"
