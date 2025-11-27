"""
Stockfish engine wrapper using python-chess.

Provides a clean interface for position evaluation with support for
depth, time, and node-limited searches, as well as MultiPV analysis.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import chess
import chess.engine

from .config import EngineConfig

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)


class EngineError(Exception):
    """Base exception for engine errors."""


class EngineStartupError(EngineError):
    """Engine failed to start or initialize."""


class EngineTimeoutError(EngineError):
    """Engine operation timed out."""


class InvalidFenError(EngineError):
    """Invalid FEN position provided."""


@dataclass
class EvaluationResult:
    """Result of a single position evaluation."""

    cp: int = 0  # Centipawns from side to move (0 if mate)
    mate: int = 0  # Mate in N moves (0 if not mate)
    depth: int = 0  # Actual search depth achieved
    best_line: list[str] = field(default_factory=list)  # Best line in UCI notation
    alternatives: list[EvaluationResult] = field(default_factory=list)  # MultiPV results


class StockfishEngine:
    """
    Wrapper around python-chess SimpleEngine for Stockfish.

    This class is NOT thread-safe. Each engine instance should be
    used by one thread at a time (managed by EnginePool).

    Usage:
        engine = StockfishEngine(config)
        engine.start()
        try:
            result = engine.evaluate("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            print(f"Evaluation: {result.cp} cp")
        finally:
            engine.stop()
    """

    def __init__(self, config: EngineConfig | None = None) -> None:
        """Initialize the engine wrapper.

        Args:
            config: Engine configuration. Uses defaults if not provided.
        """
        self._config = config or EngineConfig()
        self._engine: chess.engine.SimpleEngine | None = None
        self._version: str | None = None

    @property
    def path(self) -> Path:
        """Get the engine binary path."""
        return self._config.stockfish_path

    @property
    def version(self) -> str:
        """Get the engine version string."""
        if self._version is None:
            return "not started"
        return self._version

    def is_alive(self) -> bool:
        """Check if the engine process is running."""
        if self._engine is None:
            return False
        try:
            # Check if process is still running via transport
            transport = self._engine.protocol.transport
            if transport is None:
                return False
            return transport.get_returncode() is None
        except Exception:
            return False

    def start(self) -> None:
        """Start the Stockfish engine process.

        Raises:
            EngineStartupError: If the engine fails to start.
        """
        if self._engine is not None:
            logger.warning("Engine already started, stopping first")
            self.stop()

        try:
            logger.info(f"Starting Stockfish from {self._config.stockfish_path}")
            self._engine = chess.engine.SimpleEngine.popen_uci(
                str(self._config.stockfish_path),
                timeout=self._config.startup_timeout,
            )

            # Get version from engine ID
            self._version = self._engine.id.get("name", "unknown")
            logger.info(f"Engine started: {self._version}")

            # Configure engine options
            if self._config.threads > 1:
                self._engine.configure({"Threads": self._config.threads})
            if self._config.hash_mb != 64:  # 64 is default
                self._engine.configure({"Hash": self._config.hash_mb})

        except chess.engine.EngineTerminatedError as e:
            raise EngineStartupError(f"Engine terminated during startup: {e}") from e
        except FileNotFoundError as e:
            raise EngineStartupError(
                f"Stockfish binary not found at {self._config.stockfish_path}"
            ) from e
        except Exception as e:
            raise EngineStartupError(f"Failed to start engine: {e}") from e

    def stop(self) -> None:
        """Stop the Stockfish engine process gracefully."""
        if self._engine is not None:
            try:
                self._engine.quit()
                logger.info("Engine stopped")
            except Exception as e:
                logger.warning(f"Error stopping engine: {e}")
            finally:
                self._engine = None
                self._version = None

    def new_game(self) -> None:
        """Reset engine state for a new game (clears hash)."""
        if self._engine is None:
            raise EngineError("Engine not started")
        try:
            # Send ucinewgame to clear hash tables
            self._engine.protocol.send_line("ucinewgame")
            # Wait for engine to be ready
            self._engine.ping()
        except Exception as e:
            logger.warning(f"Error resetting for new game: {e}")

    def evaluate(
        self,
        fen: str,
        depth: int | None = None,
        time_ms: int | None = None,
        nodes: int | None = None,
        multipv: int = 1,
    ) -> EvaluationResult:
        """Evaluate a chess position.

        Args:
            fen: Position in FEN notation.
            depth: Search depth limit (None = no limit).
            time_ms: Time limit in milliseconds (None = no limit).
            nodes: Node limit (None = no limit).
            multipv: Number of principal variations to return (default 1).

        Returns:
            EvaluationResult with the evaluation data.

        Raises:
            EngineError: If the engine is not started.
            InvalidFenError: If the FEN is invalid.
            EngineTimeoutError: If the search times out.
        """
        if self._engine is None:
            raise EngineError("Engine not started")

        # Parse and validate FEN
        try:
            board = chess.Board(fen)
        except ValueError as e:
            raise InvalidFenError(f"Invalid FEN: {fen}") from e

        # Build search limit
        limit = chess.engine.Limit(
            depth=depth if depth and depth > 0 else None,
            time=time_ms / 1000 if time_ms and time_ms > 0 else None,
            nodes=nodes if nodes and nodes > 0 else None,
        )

        # Default to depth 20 if no limits specified
        if limit.depth is None and limit.time is None and limit.nodes is None:
            limit = chess.engine.Limit(depth=20)

        try:
            # Run analysis
            multipv = max(1, min(multipv, 10))  # Clamp to reasonable range
            infos = self._engine.analyse(board, limit, multipv=multipv)

            # Handle single vs multi PV response
            if not isinstance(infos, list):
                infos = [infos]

            results = []
            for info in infos:
                result = self._parse_info(info, board.turn)
                if result is not None:
                    results.append(result)

            if not results:
                raise EngineError("No evaluation results returned")

            # Primary result with alternatives
            primary = results[0]
            primary.alternatives = results[1:] if len(results) > 1 else []

            return primary

        except chess.engine.EngineTerminatedError as e:
            raise EngineError(f"Engine terminated during evaluation: {e}") from e
        except Exception as e:
            if "timeout" in str(e).lower():
                raise EngineTimeoutError(f"Evaluation timed out: {e}") from e
            raise EngineError(f"Evaluation failed: {e}") from e

    def _parse_info(
        self, info: chess.engine.InfoDict, turn: chess.Color
    ) -> EvaluationResult | None:
        """Parse a python-chess info dict into an EvaluationResult.

        Args:
            info: The info dict from engine.analyse().
            turn: The side to move (for score perspective).

        Returns:
            EvaluationResult or None if no score available.
        """
        score = info.get("score")
        if score is None:
            return None

        # Get score from side-to-move perspective
        pov_score = score.white() if turn == chess.WHITE else score.black()

        cp = 0
        mate = 0
        if pov_score.is_mate():
            mate = pov_score.mate() or 0
        else:
            cp = pov_score.score() or 0

        # Get principal variation as UCI strings
        pv = info.get("pv", [])
        best_line = [move.uci() for move in pv]

        return EvaluationResult(
            cp=cp,
            mate=mate,
            depth=info.get("depth", 0),
            best_line=best_line,
        )
