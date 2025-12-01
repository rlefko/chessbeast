"""
Unit tests for the SF16 eval parser.

Tests parsing of Stockfish 16 `eval` command output.
"""

import pytest

from conftest import SAMPLE_EVAL_OUTPUT
from stockfish16_service.engine import ClassicalEvalResult, PhaseScore
from stockfish16_service.eval_parser import format_classical_eval, parse_eval_output


class TestParseEvalOutput:
    """Tests for parse_eval_output function."""

    def test_parse_complete_output(self) -> None:
        """Parser correctly extracts all components from sample output."""
        result = parse_eval_output(SAMPLE_EVAL_OUTPUT)

        # Check material
        assert result.material.white.mg == pytest.approx(4.12)
        assert result.material.white.eg == pytest.approx(4.50)
        assert result.material.black.mg == pytest.approx(-4.12)
        assert result.material.black.eg == pytest.approx(-4.50)
        assert result.material.total.mg == pytest.approx(0.0)
        assert result.material.total.eg == pytest.approx(0.0)

    def test_parse_mobility(self) -> None:
        """Parser correctly extracts mobility component."""
        result = parse_eval_output(SAMPLE_EVAL_OUTPUT)

        assert result.mobility.white.mg == pytest.approx(0.45)
        assert result.mobility.white.eg == pytest.approx(0.31)
        assert result.mobility.total.mg == pytest.approx(0.45)
        assert result.mobility.total.eg == pytest.approx(0.31)

    def test_parse_king_safety(self) -> None:
        """Parser correctly extracts king safety component."""
        result = parse_eval_output(SAMPLE_EVAL_OUTPUT)

        assert result.king_safety.white.mg == pytest.approx(0.18)
        assert result.king_safety.white.eg == pytest.approx(-0.04)
        assert result.king_safety.total.mg == pytest.approx(0.18)
        assert result.king_safety.total.eg == pytest.approx(-0.04)

    def test_parse_total(self) -> None:
        """Parser correctly extracts total evaluation."""
        result = parse_eval_output(SAMPLE_EVAL_OUTPUT)

        assert result.total.total.mg == pytest.approx(0.56)
        assert result.total.total.eg == pytest.approx(0.41)

    def test_parse_final_eval_cp(self) -> None:
        """Parser calculates final eval in centipawns."""
        result = parse_eval_output(SAMPLE_EVAL_OUTPUT)

        # Average of 0.56 and 0.41 is 0.485, times 100 = 48.5, rounded to 48
        assert result.final_eval_cp == pytest.approx(48, abs=2)

    def test_parse_empty_lines(self) -> None:
        """Parser handles empty input gracefully."""
        result = parse_eval_output([])

        assert result.material.total.mg == 0.0
        assert result.total.total.mg == 0.0
        assert result.final_eval_cp == 0

    def test_parse_header_only(self) -> None:
        """Parser handles header-only input."""
        lines = [
            "      Term    |    White    |    Black    |    Total",
            "              |   MG    EG  |   MG    EG  |   MG    EG",
            "------------------------------------------------------",
        ]
        result = parse_eval_output(lines)

        assert result.material.total.mg == 0.0
        assert result.final_eval_cp == 0

    def test_parse_negative_values(self) -> None:
        """Parser handles negative values correctly."""
        lines = [
            "    Material |  -1.00 -1.50|  +1.00 +1.50|  +0.00 +0.00",
        ]
        result = parse_eval_output(lines)

        assert result.material.white.mg == pytest.approx(-1.0)
        assert result.material.white.eg == pytest.approx(-1.5)
        assert result.material.black.mg == pytest.approx(1.0)
        assert result.material.black.eg == pytest.approx(1.5)


class TestFormatClassicalEval:
    """Tests for format_classical_eval function."""

    def test_format_basic_result(self) -> None:
        """Formatter produces human-readable output."""
        result = ClassicalEvalResult()
        result.mobility.total = PhaseScore(mg=0.45, eg=0.31)
        result.king_safety.total = PhaseScore(mg=0.18, eg=-0.04)
        result.total.total = PhaseScore(mg=0.56, eg=0.41)
        result.final_eval_cp = 48

        output = format_classical_eval(result)

        assert "Mobility:" in output
        assert "+0.45" in output
        assert "King Safety:" in output
        assert "+0.18" in output
        assert "Total:" in output
        assert "+48" in output
