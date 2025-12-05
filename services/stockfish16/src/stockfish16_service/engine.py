"""
Stockfish 16 engine wrapper for classical evaluation extraction.

Unlike the main Stockfish service which uses `go` for search, this wrapper
uses the `eval` command to extract the classical evaluation breakdown
(material, mobility, king safety, threats, space, etc.).

The `eval` command is only available in SF16 and earlier - newer versions
use pure NNUE and don't expose the classical breakdown.
"""

from __future__ import annotations

import logging
import subprocess
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import chess

# Import exceptions from common package
from common import EngineError, EngineStartupError, EvalNotAvailableError, InvalidFenError

from .config import Stockfish16Config

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Re-export for backwards compatibility
__all__ = [
    "EngineError",
    "EngineStartupError",
    "InvalidFenError",
    "EvalNotAvailableError",
    "PhaseScore",
    "SideBreakdown",
    "ClassicalEvalResult",
    "Stockfish16Engine",
]


@dataclass
class PhaseScore:
    """Middlegame and endgame score components."""

    mg: float = 0.0  # Middlegame value in pawns
    eg: float = 0.0  # Endgame value in pawns


@dataclass
class SideBreakdown:
    """Per-side breakdown for an evaluation component."""

    white: PhaseScore = field(default_factory=PhaseScore)
    black: PhaseScore = field(default_factory=PhaseScore)
    total: PhaseScore = field(default_factory=PhaseScore)


@dataclass
class ClassicalEvalResult:
    """Complete classical evaluation breakdown from SF16."""

    material: SideBreakdown = field(default_factory=SideBreakdown)
    imbalance: SideBreakdown = field(default_factory=SideBreakdown)
    pawns: SideBreakdown = field(default_factory=SideBreakdown)
    knights: SideBreakdown = field(default_factory=SideBreakdown)
    bishops: SideBreakdown = field(default_factory=SideBreakdown)
    rooks: SideBreakdown = field(default_factory=SideBreakdown)
    queens: SideBreakdown = field(default_factory=SideBreakdown)
    mobility: SideBreakdown = field(default_factory=SideBreakdown)
    king_safety: SideBreakdown = field(default_factory=SideBreakdown)
    threats: SideBreakdown = field(default_factory=SideBreakdown)
    passed: SideBreakdown = field(default_factory=SideBreakdown)
    space: SideBreakdown = field(default_factory=SideBreakdown)
    winnable: SideBreakdown = field(default_factory=SideBreakdown)
    total: SideBreakdown = field(default_factory=SideBreakdown)
    final_eval_cp: int = 0  # Final blended eval in centipawns


class Stockfish16Engine:
    """
    Wrapper for Stockfish 16 to extract classical evaluation.

    This class communicates with SF16 via UCI protocol and uses the
    `eval` command to get detailed positional breakdown.

    Usage:
        engine = Stockfish16Engine(config)
        engine.start()
        try:
            result = engine.get_classical_eval("rnbqkbnr/pppppppp/...")
            print(f"Mobility: {result.mobility.total.mg}")
        finally:
            engine.stop()
    """

    def __init__(self, config: Stockfish16Config | None = None) -> None:
        """Initialize the engine wrapper."""
        self._config = config or Stockfish16Config()
        self._process: subprocess.Popen[str] | None = None
        self._version: str | None = None
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        """Get the engine binary path."""
        return self._config.engine_path

    @property
    def version(self) -> str:
        """Get the engine version string."""
        return self._version or "not started"

    def is_alive(self) -> bool:
        """Check if the engine process is running."""
        if self._process is None:
            return False
        return self._process.poll() is None

    def start(self) -> None:
        """Start the Stockfish 16 engine process."""
        if self._process is not None:
            logger.warning("Engine already started, stopping first")
            self.stop()

        try:
            logger.info(f"Starting Stockfish 16 from {self._config.engine_path}")
            self._process = subprocess.Popen(
                [str(self._config.engine_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )

            # Initialize UCI protocol
            self._send("uci")
            response = self._read_until("uciok", timeout=self._config.engine_startup_timeout)

            # Extract version from id name line
            for line in response:
                if line.startswith("id name "):
                    self._version = line[8:].strip()
                    break

            logger.info(f"Engine started: {self._version}")

            # Configure engine options
            if self._config.engine_threads > 1:
                self._send(f"setoption name Threads value {self._config.engine_threads}")
            self._send(f"setoption name Hash value {self._config.engine_hash_mb}")

            # Wait for ready
            self._send("isready")
            self._read_until("readyok", timeout=5.0)

        except FileNotFoundError as e:
            raise EngineStartupError(
                f"Stockfish 16 binary not found at {self._config.engine_path}"
            ) from e
        except Exception as e:
            self.stop()
            raise EngineStartupError(f"Failed to start engine: {e}") from e

    def stop(self) -> None:
        """Stop the engine process gracefully."""
        if self._process is not None:
            try:
                self._send("quit")
                self._process.wait(timeout=2.0)
                logger.info("Engine stopped")
            except Exception as e:
                logger.warning(f"Error stopping engine: {e}")
                self._process.kill()
            finally:
                self._process = None
                self._version = None

    def get_classical_eval(self, fen: str) -> ClassicalEvalResult:
        """
        Get classical evaluation breakdown for a position.

        Args:
            fen: Position in FEN notation.

        Returns:
            ClassicalEvalResult with detailed positional breakdown.

        Raises:
            EngineError: If the engine is not started.
            InvalidFenError: If the FEN is invalid.
            EvalNotAvailableError: If classical eval is not available.
        """
        if self._process is None:
            raise EngineError("Engine not started")

        # Validate FEN
        try:
            chess.Board(fen)
        except ValueError as e:
            raise InvalidFenError(f"Invalid FEN: {fen}") from e

        with self._lock:
            # Set position
            self._send(f"position fen {fen}")

            # Request evaluation
            self._send("eval")

            # Read eval output until we see the final total line
            output = self._read_eval_output(timeout=10.0)

        # Parse the eval output
        from .eval_parser import parse_eval_output

        return parse_eval_output(output)

    def _send(self, command: str) -> None:
        """Send a command to the engine."""
        if self._process is None or self._process.stdin is None:
            raise EngineError("Engine not started")
        self._process.stdin.write(command + "\n")
        self._process.stdin.flush()
        logger.debug(f"Sent: {command}")

    def _read_until(self, terminator: str, timeout: float = 5.0) -> list[str]:
        """Read lines until we see the terminator."""
        import threading

        if self._process is None or self._process.stdout is None:
            raise EngineError("Engine not started")

        result: list[str] = []
        error: list[Exception] = []

        def read_output() -> None:
            try:
                while True:
                    line = self._process.stdout.readline()  # type: ignore
                    if not line:
                        break
                    line = line.strip()
                    logger.debug(f"Recv: {line}")
                    result.append(line)
                    if line == terminator:
                        break
            except Exception as e:
                error.append(e)

        thread = threading.Thread(target=read_output, daemon=True)
        thread.start()
        thread.join(timeout=timeout)

        if thread.is_alive():
            raise EngineError(f"Timeout waiting for {terminator}")
        if error:
            raise error[0]

        return result

    def _read_eval_output(self, timeout: float = 10.0) -> list[str]:
        """Read the complete eval command output."""
        import threading

        if self._process is None or self._process.stdout is None:
            raise EngineError("Engine not started")

        result: list[str] = []
        error: list[Exception] = []
        done = threading.Event()

        def read_output() -> None:
            try:
                in_eval_section = False

                while True:
                    line = self._process.stdout.readline()  # type: ignore
                    if not line:
                        break
                    line = line.strip()
                    logger.debug(f"Recv: {line}")

                    # Look for the eval table
                    if "Term" in line and "White" in line and "Black" in line:
                        in_eval_section = True

                    if in_eval_section:
                        result.append(line)

                        # SF16 eval output ends with "Total" line - no further output
                        if line.startswith("Total"):
                            done.set()
                            break
            except Exception as e:
                error.append(e)
                done.set()

        thread = threading.Thread(target=read_output, daemon=True)
        thread.start()
        thread.join(timeout=timeout)

        if error:
            raise error[0]

        if not done.is_set():
            raise EngineError("Timeout waiting for eval output")

        if not result:
            raise EvalNotAvailableError(
                "No eval output received. Is this SF16 or earlier? "
                "SF17+ uses pure NNUE and doesn't support the eval command."
            )

        return result
