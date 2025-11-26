from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PredictRequest(_message.Message):
    __slots__ = ("fen", "rating_band")
    FEN_FIELD_NUMBER: _ClassVar[int]
    RATING_BAND_FIELD_NUMBER: _ClassVar[int]
    fen: str
    rating_band: int
    def __init__(self, fen: _Optional[str] = ..., rating_band: _Optional[int] = ...) -> None: ...

class MovePrediction(_message.Message):
    __slots__ = ("move", "probability")
    MOVE_FIELD_NUMBER: _ClassVar[int]
    PROBABILITY_FIELD_NUMBER: _ClassVar[int]
    move: str
    probability: float
    def __init__(self, move: _Optional[str] = ..., probability: _Optional[float] = ...) -> None: ...

class PredictResponse(_message.Message):
    __slots__ = ("predictions",)
    PREDICTIONS_FIELD_NUMBER: _ClassVar[int]
    predictions: _containers.RepeatedCompositeFieldContainer[MovePrediction]
    def __init__(self, predictions: _Optional[_Iterable[_Union[MovePrediction, _Mapping]]] = ...) -> None: ...

class GameMove(_message.Message):
    __slots__ = ("fen", "played_move")
    FEN_FIELD_NUMBER: _ClassVar[int]
    PLAYED_MOVE_FIELD_NUMBER: _ClassVar[int]
    fen: str
    played_move: str
    def __init__(self, fen: _Optional[str] = ..., played_move: _Optional[str] = ...) -> None: ...

class EstimateRatingRequest(_message.Message):
    __slots__ = ("moves",)
    MOVES_FIELD_NUMBER: _ClassVar[int]
    moves: _containers.RepeatedCompositeFieldContainer[GameMove]
    def __init__(self, moves: _Optional[_Iterable[_Union[GameMove, _Mapping]]] = ...) -> None: ...

class EstimateRatingResponse(_message.Message):
    __slots__ = ("estimated_rating", "confidence_low", "confidence_high")
    ESTIMATED_RATING_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_LOW_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_HIGH_FIELD_NUMBER: _ClassVar[int]
    estimated_rating: int
    confidence_low: int
    confidence_high: int
    def __init__(self, estimated_rating: _Optional[int] = ..., confidence_low: _Optional[int] = ..., confidence_high: _Optional[int] = ...) -> None: ...

class HealthCheckRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckResponse(_message.Message):
    __slots__ = ("healthy", "loaded_models")
    HEALTHY_FIELD_NUMBER: _ClassVar[int]
    LOADED_MODELS_FIELD_NUMBER: _ClassVar[int]
    healthy: bool
    loaded_models: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, healthy: bool = ..., loaded_models: _Optional[_Iterable[int]] = ...) -> None: ...
