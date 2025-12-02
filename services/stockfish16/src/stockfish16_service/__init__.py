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
from .eval_parser import format_classical_eval, parse_eval_output
from .pool import EngineUnavailableError, Stockfish16Manager
from .server import create_server, serve

__all__ = [
    # Config
    "Stockfish16Config",
    # Engine
    "Stockfish16Engine",
    "ClassicalEvalResult",
    "PhaseScore",
    "SideBreakdown",
    # Errors
    "EngineError",
    "EngineStartupError",
    "InvalidFenError",
    "EvalNotAvailableError",
    "EngineUnavailableError",
    # Parser
    "parse_eval_output",
    "format_classical_eval",
    # Manager
    "Stockfish16Manager",
    # Server
    "create_server",
    "serve",
]
