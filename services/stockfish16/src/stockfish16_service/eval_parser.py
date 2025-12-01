"""
Parser for Stockfish 16 `eval` command output.

Extracts classical evaluation components from the tabular output:
material, imbalance, pawns, knights, bishops, rooks, queens,
mobility, king safety, threats, passed pawns, space, winnable.

Example SF16 eval output:
      Term    |    White    |    Black    |    Total
              |   MG    EG  |   MG    EG  |   MG    EG
------------------------------------------------------
    Material |  +4.12 +4.50|  -4.12 -4.50|  +0.00 +0.00
   Imbalance |  +0.02 -0.00|  -0.02 +0.00|  +0.00 +0.00
     ...
      Total  |             |             |  +0.56 +0.41
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from .engine import ClassicalEvalResult, PhaseScore, SideBreakdown

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Regex to parse eval table rows
# Matches: "    Material |  +4.12 +4.50|  -4.12 -4.50|  +0.00 +0.00"
EVAL_ROW_PATTERN = re.compile(
    r"^\s*(\w[\w\s]*?)\s*\|"  # Term name
    r"\s*([\+\-]?\d+\.\d+)?\s*([\+\-]?\d+\.\d+)?\s*\|"  # White MG, EG
    r"\s*([\+\-]?\d+\.\d+)?\s*([\+\-]?\d+\.\d+)?\s*\|"  # Black MG, EG
    r"\s*([\+\-]?\d+\.\d+)?\s*([\+\-]?\d+\.\d+)?"  # Total MG, EG
)

# Map term names to ClassicalEvalResult field names
TERM_FIELD_MAP = {
    "material": "material",
    "imbalance": "imbalance",
    "pawns": "pawns",
    "knights": "knights",
    "bishops": "bishops",
    "rooks": "rooks",
    "queens": "queens",
    "mobility": "mobility",
    "king safety": "king_safety",
    "threats": "threats",
    "passed": "passed",
    "space": "space",
    "winnable": "winnable",
    "total": "total",
}


def parse_eval_output(lines: list[str]) -> ClassicalEvalResult:
    """
    Parse SF16 eval command output into structured result.

    Args:
        lines: Lines of output from the eval command.

    Returns:
        ClassicalEvalResult with all components populated.
    """
    result = ClassicalEvalResult()

    for line in lines:
        # Skip header and separator lines
        if "---" in line or "Term" in line or "MG" in line:
            continue

        match = EVAL_ROW_PATTERN.match(line)
        if not match:
            continue

        term = match.group(1).strip().lower()
        field_name = TERM_FIELD_MAP.get(term)

        if field_name is None:
            logger.debug(f"Unknown eval term: {term}")
            continue

        # Parse the scores
        white_mg = _parse_float(match.group(2))
        white_eg = _parse_float(match.group(3))
        black_mg = _parse_float(match.group(4))
        black_eg = _parse_float(match.group(5))
        total_mg = _parse_float(match.group(6))
        total_eg = _parse_float(match.group(7))

        # Create the breakdown
        breakdown = SideBreakdown(
            white=PhaseScore(mg=white_mg, eg=white_eg),
            black=PhaseScore(mg=black_mg, eg=black_eg),
            total=PhaseScore(mg=total_mg, eg=total_eg),
        )

        # Set the field on result
        setattr(result, field_name, breakdown)

    # Calculate final eval in centipawns from total
    # Use a simple blend: (mg + eg) / 2 * 100 for approximate cp value
    if result.total.total.mg != 0 or result.total.total.eg != 0:
        # Simple average of MG and EG as rough estimate
        avg_pawns = (result.total.total.mg + result.total.total.eg) / 2
        result.final_eval_cp = int(avg_pawns * 100)

    return result


def _parse_float(value: str | None) -> float:
    """Parse a float value from the eval output, defaulting to 0.0."""
    if value is None or value.strip() == "":
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def format_classical_eval(result: ClassicalEvalResult) -> str:
    """
    Format classical eval result as human-readable string.

    Useful for debugging and logging.
    """
    lines = [
        "Classical Evaluation Breakdown:",
        f"  Material:    MG={result.material.total.mg:+.2f}  EG={result.material.total.eg:+.2f}",
        f"  Mobility:    MG={result.mobility.total.mg:+.2f}  EG={result.mobility.total.eg:+.2f}",
        f"  King Safety: MG={result.king_safety.total.mg:+.2f}  EG={result.king_safety.total.eg:+.2f}",
        f"  Threats:     MG={result.threats.total.mg:+.2f}  EG={result.threats.total.eg:+.2f}",
        f"  Pawns:       MG={result.pawns.total.mg:+.2f}  EG={result.pawns.total.eg:+.2f}",
        f"  Space:       MG={result.space.total.mg:+.2f}  EG={result.space.total.eg:+.2f}",
        f"  Total:       MG={result.total.total.mg:+.2f}  EG={result.total.total.eg:+.2f}",
        f"  Final (cp):  {result.final_eval_cp:+d}",
    ]
    return "\n".join(lines)
