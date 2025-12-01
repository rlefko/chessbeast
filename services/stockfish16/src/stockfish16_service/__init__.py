"""
Stockfish 16 classical evaluation gRPC service.

This service provides detailed positional breakdown using SF16's classical
evaluation terms (material, mobility, king safety, threats, space, etc.).

Unlike the main Stockfish service which uses NNUE for evaluation, this
service extracts the classical evaluation components which are useful for
explaining WHY a position is good or bad in human-understandable terms.
"""

from .config import Stockfish16Config
from .engine import (
    ClassicalEvalResult,
    EngineError,
    EngineStartupError,
    EvalNotAvailableError,
    InvalidFenError,
    PhaseScore,
    SideBreakdown,
    Stockfish16Engine,
)

__all__ = [
    "Stockfish16Config",
    "Stockfish16Engine",
    "ClassicalEvalResult",
    "PhaseScore",
    "SideBreakdown",
    "EngineError",
    "EngineStartupError",
    "InvalidFenError",
    "EvalNotAvailableError",
]
