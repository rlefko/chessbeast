from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ClassicalEvalRequest(_message.Message):
    __slots__ = ("fen",)
    FEN_FIELD_NUMBER: _ClassVar[int]
    fen: str
    def __init__(self, fen: _Optional[str] = ...) -> None: ...

class PhaseScore(_message.Message):
    __slots__ = ("mg", "eg")
    MG_FIELD_NUMBER: _ClassVar[int]
    EG_FIELD_NUMBER: _ClassVar[int]
    mg: float
    eg: float
    def __init__(self, mg: _Optional[float] = ..., eg: _Optional[float] = ...) -> None: ...

class SideBreakdown(_message.Message):
    __slots__ = ("white", "black", "total")
    WHITE_FIELD_NUMBER: _ClassVar[int]
    BLACK_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    white: PhaseScore
    black: PhaseScore
    total: PhaseScore
    def __init__(self, white: _Optional[_Union[PhaseScore, _Mapping]] = ..., black: _Optional[_Union[PhaseScore, _Mapping]] = ..., total: _Optional[_Union[PhaseScore, _Mapping]] = ...) -> None: ...

class ClassicalEvalResponse(_message.Message):
    __slots__ = ("material", "imbalance", "pawns", "knights", "bishops", "rooks", "queens", "mobility", "king_safety", "threats", "passed", "space", "winnable", "total", "final_eval_cp")
    MATERIAL_FIELD_NUMBER: _ClassVar[int]
    IMBALANCE_FIELD_NUMBER: _ClassVar[int]
    PAWNS_FIELD_NUMBER: _ClassVar[int]
    KNIGHTS_FIELD_NUMBER: _ClassVar[int]
    BISHOPS_FIELD_NUMBER: _ClassVar[int]
    ROOKS_FIELD_NUMBER: _ClassVar[int]
    QUEENS_FIELD_NUMBER: _ClassVar[int]
    MOBILITY_FIELD_NUMBER: _ClassVar[int]
    KING_SAFETY_FIELD_NUMBER: _ClassVar[int]
    THREATS_FIELD_NUMBER: _ClassVar[int]
    PASSED_FIELD_NUMBER: _ClassVar[int]
    SPACE_FIELD_NUMBER: _ClassVar[int]
    WINNABLE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    FINAL_EVAL_CP_FIELD_NUMBER: _ClassVar[int]
    material: SideBreakdown
    imbalance: SideBreakdown
    pawns: SideBreakdown
    knights: SideBreakdown
    bishops: SideBreakdown
    rooks: SideBreakdown
    queens: SideBreakdown
    mobility: SideBreakdown
    king_safety: SideBreakdown
    threats: SideBreakdown
    passed: SideBreakdown
    space: SideBreakdown
    winnable: SideBreakdown
    total: SideBreakdown
    final_eval_cp: int
    def __init__(self, material: _Optional[_Union[SideBreakdown, _Mapping]] = ..., imbalance: _Optional[_Union[SideBreakdown, _Mapping]] = ..., pawns: _Optional[_Union[SideBreakdown, _Mapping]] = ..., knights: _Optional[_Union[SideBreakdown, _Mapping]] = ..., bishops: _Optional[_Union[SideBreakdown, _Mapping]] = ..., rooks: _Optional[_Union[SideBreakdown, _Mapping]] = ..., queens: _Optional[_Union[SideBreakdown, _Mapping]] = ..., mobility: _Optional[_Union[SideBreakdown, _Mapping]] = ..., king_safety: _Optional[_Union[SideBreakdown, _Mapping]] = ..., threats: _Optional[_Union[SideBreakdown, _Mapping]] = ..., passed: _Optional[_Union[SideBreakdown, _Mapping]] = ..., space: _Optional[_Union[SideBreakdown, _Mapping]] = ..., winnable: _Optional[_Union[SideBreakdown, _Mapping]] = ..., total: _Optional[_Union[SideBreakdown, _Mapping]] = ..., final_eval_cp: _Optional[int] = ...) -> None: ...

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
