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

from .config import ModelConfig

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# =============================================================================
# Exceptions
# =============================================================================


class MaiaError(Exception):
    """Base exception for Maia service errors."""


class ModelLoadError(MaiaError):
    """Failed to load the Maia2 model."""


class ModelInferenceError(MaiaError):
    """Model inference failed."""


class InvalidFenError(MaiaError):
    """Invalid FEN position provided."""


class InvalidRatingError(MaiaError):
    """Invalid ELO rating provided."""


class ModelNotLoadedError(MaiaError):
    """Model is not loaded."""


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

    @property
    def model_type(self) -> str:
        """Get the model type (rapid or blitz)."""
        return self._config.model_type

    @property
    def device(self) -> str:
        """Get the device (cpu or cuda)."""
        return self._config.device

    def load(self) -> None:
        """Load the Maia2 model.

        Raises:
            ModelLoadError: If the model fails to load.
        """
        if self._is_loaded:
            logger.warning("Model already loaded")
            return

        try:
            # Import maia2 here to allow mocking in tests
            from maia2 import inference, model

            logger.info(
                f"Loading Maia2 model (type={self._config.model_type}, device={self._config.device})"
            )

            # Load the pretrained model
            self._model = model.from_pretrained(
                type=self._config.model_type, device=self._config.device
            )

            # Prepare inference context
            self._prepared = inference.prepare()

            self._is_loaded = True
            logger.info("Maia2 model loaded successfully")

        except ImportError as e:
            raise ModelLoadError(
                "maia2 package not installed. Install with: pip install maia2"
            ) from e
        except Exception as e:
            raise ModelLoadError(f"Failed to load Maia2 model: {e}") from e

    def shutdown(self) -> None:
        """Shutdown the model and release resources."""
        if self._model is not None:
            try:
                # Clear model references
                self._model = None
                self._prepared = None
                self._is_loaded = False
                logger.info("Maia2 model shutdown complete")
            except Exception as e:
                logger.warning(f"Error during model shutdown: {e}")

    def predict(
        self,
        fen: str,
        elo_self: int,
        elo_opponent: int = 1500,
        top_k: int = 5,
    ) -> list[MovePrediction]:
        """Predict the most likely human moves for a position.

        Args:
            fen: Position in FEN notation.
            elo_self: Player's ELO rating.
            elo_opponent: Opponent's ELO rating (default 1500).
            top_k: Number of top moves to return (default 5).

        Returns:
            List of MovePrediction objects sorted by probability (descending).

        Raises:
            ModelNotLoadedError: If the model is not loaded.
            InvalidFenError: If the FEN is invalid.
            InvalidRatingError: If the ELO rating is invalid.
            ModelInferenceError: If inference fails.
        """
        if not self._is_loaded:
            raise ModelNotLoadedError("Model not loaded. Call load() first.")

        # Validate FEN
        try:
            board = chess.Board(fen)
        except ValueError as e:
            raise InvalidFenError(f"Invalid FEN: {fen}") from e

        # Validate ELO ratings
        if not (0 <= elo_self <= 4000):
            raise InvalidRatingError(f"Invalid ELO rating: {elo_self}. Must be 0-4000.")
        if not (0 <= elo_opponent <= 4000):
            raise InvalidRatingError(f"Invalid opponent ELO: {elo_opponent}. Must be 0-4000.")

        # Check for legal moves
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            # No legal moves - checkmate or stalemate
            return []

        try:
            # Import maia2 inference
            from maia2 import inference

            # Run inference
            move_probs, _win_prob = inference.inference_each(
                self._model, self._prepared, fen, elo_self, elo_opponent
            )

            # Convert to MovePrediction list
            predictions: list[MovePrediction] = []
            for move_uci, prob in move_probs.items():
                predictions.append(MovePrediction(move=move_uci, probability=float(prob)))

            # Sort by probability (descending) and take top_k
            predictions.sort(key=lambda p: p.probability, reverse=True)
            return predictions[:top_k]

        except Exception as e:
            raise ModelInferenceError(f"Inference failed: {e}") from e

    def estimate_rating(
        self,
        moves: list[tuple[str, str]],
        opponent_elo: int = 1500,
    ) -> tuple[int, int, int]:
        """Estimate player rating from a sequence of moves.

        Uses maximum likelihood estimation across ELO values to find the
        rating that best explains the played moves.

        Args:
            moves: List of (fen, played_move_uci) tuples.
            opponent_elo: Assumed opponent ELO (default 1500).

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
            # Return default with wide confidence for empty moves
            return (1500, 800, 2200)

        # Test ELO values to check
        test_elos = list(range(800, 2401, 100))
        log_probs: dict[int, float] = {}

        try:
            from maia2 import inference

            for test_elo in test_elos:
                total_log_prob = 0.0

                for fen, played_move in moves:
                    # Validate FEN
                    try:
                        chess.Board(fen)
                    except ValueError as e:
                        raise InvalidFenError(f"Invalid FEN: {fen}") from e

                    # Get predictions for this ELO
                    move_probs, _ = inference.inference_each(
                        self._model, self._prepared, fen, test_elo, opponent_elo
                    )

                    # Find probability of the played move
                    prob = move_probs.get(played_move, 0.001)  # Smoothing
                    total_log_prob += math.log(max(prob, 1e-10))

                # Average log probability
                log_probs[test_elo] = total_log_prob / len(moves)

            # Find best ELO (highest average log probability)
            best_elo = max(log_probs, key=lambda e: log_probs[e])
            best_log_prob = log_probs[best_elo]

            # Confidence bounds: ELOs within threshold of best
            threshold = 0.5  # Log probability difference threshold
            nearby_elos = [elo for elo, lp in log_probs.items() if best_log_prob - lp < threshold]

            confidence_low = min(nearby_elos)
            confidence_high = max(nearby_elos)

            return (best_elo, confidence_low, confidence_high)

        except InvalidFenError:
            raise
        except Exception as e:
            raise ModelInferenceError(f"Rating estimation failed: {e}") from e
