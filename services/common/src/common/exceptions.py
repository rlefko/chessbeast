"""
Unified exception hierarchy for ChessBeast services.

Consolidates exceptions from stockfish, maia, and stockfish16 services
to eliminate duplication and ensure consistent error handling.
"""

from __future__ import annotations


class ChessBeastError(Exception):
    """Base exception for all ChessBeast service errors."""


# =============================================================================
# Engine Exceptions (Stockfish, Stockfish16)
# =============================================================================


class EngineError(ChessBeastError):
    """Base exception for engine-related errors."""


class EngineStartupError(EngineError):
    """Engine failed to start or initialize."""


class EngineTimeoutError(EngineError):
    """Engine operation timed out."""


class EvalNotAvailableError(EngineError):
    """Classical eval not available (e.g., SF17+ uses pure NNUE)."""


# =============================================================================
# Common Exceptions
# =============================================================================


class InvalidFenError(ChessBeastError):
    """Invalid FEN position provided."""


# =============================================================================
# Maia Exceptions
# =============================================================================


class MaiaError(ChessBeastError):
    """Base exception for Maia service errors."""


class ModelLoadError(MaiaError):
    """Failed to load the Maia model."""


class ModelInferenceError(MaiaError):
    """Model inference failed."""


class ModelNotLoadedError(MaiaError):
    """Model is not loaded."""


class InvalidRatingError(MaiaError):
    """Invalid ELO rating provided."""
