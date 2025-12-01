import common_pb2 as _common_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class EvaluateRequest(_message.Message):
    __slots__ = ("fen", "depth", "time_limit_ms", "multipv", "nodes", "mate_min_time_ms")
    FEN_FIELD_NUMBER: _ClassVar[int]
    DEPTH_FIELD_NUMBER: _ClassVar[int]
    TIME_LIMIT_MS_FIELD_NUMBER: _ClassVar[int]
    MULTIPV_FIELD_NUMBER: _ClassVar[int]
    NODES_FIELD_NUMBER: _ClassVar[int]
    MATE_MIN_TIME_MS_FIELD_NUMBER: _ClassVar[int]
    fen: str
    depth: int
    time_limit_ms: int
    multipv: int
    nodes: int
    mate_min_time_ms: int
    def __init__(self, fen: _Optional[str] = ..., depth: _Optional[int] = ..., time_limit_ms: _Optional[int] = ..., multipv: _Optional[int] = ..., nodes: _Optional[int] = ..., mate_min_time_ms: _Optional[int] = ...) -> None: ...

class EvaluateResponse(_message.Message):
    __slots__ = ("cp", "mate", "depth", "best_line", "alternatives")
    CP_FIELD_NUMBER: _ClassVar[int]
    MATE_FIELD_NUMBER: _ClassVar[int]
    DEPTH_FIELD_NUMBER: _ClassVar[int]
    BEST_LINE_FIELD_NUMBER: _ClassVar[int]
    ALTERNATIVES_FIELD_NUMBER: _ClassVar[int]
    cp: int
    mate: int
    depth: int
    best_line: _containers.RepeatedScalarFieldContainer[str]
    alternatives: _containers.RepeatedCompositeFieldContainer[EvaluateResponse]
    def __init__(self, cp: _Optional[int] = ..., mate: _Optional[int] = ..., depth: _Optional[int] = ..., best_line: _Optional[_Iterable[str]] = ..., alternatives: _Optional[_Iterable[_Union[EvaluateResponse, _Mapping]]] = ...) -> None: ...

class HealthCheckRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckResponse(_message.Message):
    __slots__ = ("healthy", "version")
    HEALTHY_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    healthy: bool
    version: str
    def __init__(self, healthy: bool = ..., version: _Optional[str] = ...) -> None: ...
