from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class Position(_message.Message):
    __slots__ = ("fen",)
    FEN_FIELD_NUMBER: _ClassVar[int]
    fen: str
    def __init__(self, fen: _Optional[str] = ...) -> None: ...

class Move(_message.Message):
    __slots__ = ("san", "uci")
    SAN_FIELD_NUMBER: _ClassVar[int]
    UCI_FIELD_NUMBER: _ClassVar[int]
    san: str
    uci: str
    def __init__(self, san: _Optional[str] = ..., uci: _Optional[str] = ...) -> None: ...
