"""
Maia2 model wrapper for human-likeness prediction.

Provides a clean interface for move prediction and rating estimation using
the Maia2 unified model (NeurIPS 2024).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import chess

# Import exceptions from common package
from common import (
    InvalidFenError,
    InvalidRatingError,
    MaiaError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
)

from .config import ModelConfig

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Re-export for backwards compatibility
__all__ = [
    "MaiaError",
    "ModelLoadError",
    "ModelInferenceError",
    "InvalidFenError",
    "InvalidRatingError",
    "ModelNotLoadedError",
    "MovePrediction",
    "Maia2Model",
]


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class MovePrediction:
    """A predicted move with probability."""

    move: str  # UCI format (e.g., "e2e4")
    probability: float  # 0.0 - 1.0


# =============================================================================
# Maia2 Model Wrapper
# =============================================================================


class Maia2Model:
    """
    Wrapper around Maia2 for human-like move prediction.

    This class is NOT thread-safe. Each model instance should be
    used with appropriate synchronization in multi-threaded contexts.

    Usage:
        model = Maia2Model(config)
        model.load()
        try:
            predictions = model.predict("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1500)
            print(f"Top move: {predictions[0].move} ({predictions[0].probability:.2%})")
        finally:
            model.shutdown()
    """

    def __init__(self, config: ModelConfig | None = None) -> None:
        """Initialize the model wrapper.

        Args:
            config: Model configuration. Uses defaults if not provided.
        """
        self._config = config or ModelConfig()
        self._model: Any = None
        self._prepared: Any = None
        self._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        """Check if the model is loaded."""
        return self._is_loaded

    def load(self) -> None:
        """Load the Maia2 model.

        Raises:
            ModelLoadError: If the model fails to load.
        """
        if self._is_loaded:
            logger.warning("Model already loaded")
            return

        try:
            # Import maia2 here to avoid loading torch on import
            from maia2 import Maia2

            logger.info("Loading Maia2 model...")
            self._model = Maia2()
            self._model.load()
            self._is_loaded = True
            logger.info("Maia2 model loaded successfully")

        except ImportError as e:
            raise ModelLoadError(f"Failed to import maia2: {e}") from e
        except Exception as e:
            raise ModelLoadError(f"Failed to load Maia2 model: {e}") from e

    def shutdown(self) -> None:
        """Shutdown the model and free resources."""
        if self._model is not None:
            # Maia2 doesn't have explicit cleanup, but we clear references
            self._model = None
            self._prepared = None
            self._is_loaded = False
            logger.info("Maia2 model shutdown")

    def predict(
        self,
        fen: str,
        elo_self: int,
        top_k: int = 5,
    ) -> list[MovePrediction]:
        """Predict the most likely human moves for a position.

        Args:
            fen: Position in FEN notation.
            elo_self: Player's estimated ELO rating (1100-1900).
            top_k: Number of top predictions to return.

        Returns:
            List of MovePrediction with move and probability.

        Raises:
            ModelNotLoadedError: If the model is not loaded.
            InvalidFenError: If the FEN is invalid.
            InvalidRatingError: If the rating is out of range.
            ModelInferenceError: If inference fails.
        """
        if not self._is_loaded:
            raise ModelNotLoadedError("Model not loaded. Call load() first.")

        # Validate FEN
        try:
            board = chess.Board(fen)
        except ValueError as e:
            raise InvalidFenError(f"Invalid FEN: {fen}") from e

        # Validate rating range
        if elo_self < 1100 or elo_self > 1900:
            raise InvalidRatingError(
                f"Rating must be between 1100 and 1900, got {elo_self}"
            )

        try:
            # Get predictions from Maia2
            result = self._model.predict(
                fen=fen,
                elo_self=elo_self,
            )

            # Convert to MovePrediction list
            predictions = []
            for move, prob in result.items():
                if len(predictions) >= top_k:
                    break
                predictions.append(MovePrediction(move=move, probability=float(prob)))

            # Sort by probability (should already be sorted, but ensure)
            predictions.sort(key=lambda x: x.probability, reverse=True)

            return predictions[:top_k]

        except Exception as e:
            raise ModelInferenceError(f"Prediction failed: {e}") from e

    def estimate_rating(
        self,
        moves: list[tuple[str, str]],
    ) -> tuple[int, int, int]:
        """Estimate player rating from a sequence of moves.

        Uses Maia2's rating estimation capability to infer player strength
        from their move choices.

        Args:
            moves: List of (FEN, played_move) tuples.

        Returns:
            Tuple of (estimated_rating, confidence_low, confidence_high).

        Raises:
            ModelNotLoadedError: If the model is not loaded.
            InvalidFenError: If any FEN is invalid.
            ModelInferenceError: If inference fails.
        """
        if not self._is_loaded:
            raise ModelNotLoadedError("Model not loaded. Call load() first.")

        if not moves:
            raise ModelInferenceError("At least one move is required")

        try:
            # Use Maia2's log-likelihood based estimation
            # For each rating band, compute log-likelihood of moves
            rating_bands = list(range(1100, 2000, 100))
            log_likelihoods = {r: 0.0 for r in rating_bands}

            for fen, played_move in moves:
                # Validate FEN
                try:
                    chess.Board(fen)
                except ValueError as e:
                    raise InvalidFenError(f"Invalid FEN: {fen}") from e

                # Get predictions for each rating
                for rating in rating_bands:
                    try:
                        result = self._model.predict(fen=fen, elo_self=rating)
                        prob = result.get(played_move, 0.001)  # Small epsilon
                        log_likelihoods[rating] += math.log(max(prob, 0.001))
                    except Exception:
                        # If prediction fails, skip this rating for this move
                        pass

            # Find the rating with highest log-likelihood
            best_rating = max(rating_bands, key=lambda r: log_likelihoods[r])

            # Estimate confidence interval (simple heuristic)
            confidence_width = max(100, 300 - len(moves) * 10)
            confidence_low = max(1100, best_rating - confidence_width)
            confidence_high = min(1900, best_rating + confidence_width)

            return best_rating, confidence_low, confidence_high

        except InvalidFenError:
            raise
        except Exception as e:
            raise ModelInferenceError(f"Rating estimation failed: {e}") from e
