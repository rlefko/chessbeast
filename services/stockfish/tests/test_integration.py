"""
Integration tests for the Stockfish service.

These tests require a real Stockfish binary. They are skipped by default
and can be run with: pytest --integration
"""

import pytest

from stockfish_service import (
    EngineConfig,
    EnginePool,
    EvaluationResult,
    PoolConfig,
    StockfishEngine,
)


@pytest.mark.integration
class TestStockfishEngineIntegration:
    """Integration tests for the engine wrapper with real Stockfish."""

    @pytest.fixture
    def engine(self, stockfish_available: bool) -> StockfishEngine:
        """Create a real engine instance."""
        if not stockfish_available:
            pytest.skip("Stockfish binary not available")
        engine = StockfishEngine(EngineConfig(threads=1, hash_mb=16))
        engine.start()
        yield engine
        engine.stop()

    def test_evaluate_starting_position(self, engine: StockfishEngine, starting_fen: str) -> None:
        """Starting position evaluates to roughly equal."""
        result = engine.evaluate(starting_fen, depth=10)

        assert isinstance(result, EvaluationResult)
        assert -50 <= result.cp <= 50  # Roughly equal
        assert result.mate == 0
        assert result.depth >= 10
        assert len(result.best_line) > 0

    def test_evaluate_mate_position(self, engine: StockfishEngine, mate_in_1_fen: str) -> None:
        """Mate position is correctly detected."""
        result = engine.evaluate(mate_in_1_fen, depth=10)

        assert result.mate == 1
        assert result.best_line[0] == "e1e8"  # Re1-e8#

    def test_evaluate_complex_position(self, engine: StockfishEngine, complex_fen: str) -> None:
        """Complex position returns valid evaluation."""
        result = engine.evaluate(complex_fen, depth=12)

        assert isinstance(result.cp, int)
        assert result.depth >= 12
        assert len(result.best_line) > 0

    def test_evaluate_with_time_limit(self, engine: StockfishEngine, starting_fen: str) -> None:
        """Time-limited search completes within timeout."""
        import time

        start = time.time()
        result = engine.evaluate(starting_fen, time_ms=100)
        elapsed = time.time() - start

        assert elapsed < 1.0  # Should finish well under 1 second
        assert result.depth > 0

    def test_evaluate_multipv(self, engine: StockfishEngine, starting_fen: str) -> None:
        """MultiPV returns multiple variations."""
        result = engine.evaluate(starting_fen, depth=10, multipv=3)

        assert len(result.alternatives) == 2  # 3 total - 1 primary
        # All should have best lines
        assert len(result.best_line) > 0
        for alt in result.alternatives:
            assert len(alt.best_line) > 0

    def test_engine_version(self, engine: StockfishEngine) -> None:
        """Engine reports valid version string."""
        assert "Stockfish" in engine.version or "stockfish" in engine.version.lower()


@pytest.mark.integration
class TestEnginePoolIntegration:
    """Integration tests for the engine pool with real Stockfish."""

    @pytest.fixture
    def pool(self, stockfish_available: bool) -> EnginePool:
        """Create a real engine pool."""
        if not stockfish_available:
            pytest.skip("Stockfish binary not available")
        pool = EnginePool(
            PoolConfig(size=2, acquire_timeout=10.0),
            EngineConfig(threads=1, hash_mb=16),
        )
        pool.start()
        yield pool
        pool.shutdown()

    def test_pool_health_check(self, pool: EnginePool) -> None:
        """Pool reports healthy status."""
        health = pool.health_check()

        assert health["total"] == 2
        assert health["healthy"] == 2
        assert health["available"] == 2
        assert "Stockfish" in health["version"] or "stockfish" in health["version"].lower()

    def test_concurrent_evaluations(
        self, pool: EnginePool, starting_fen: str, complex_fen: str
    ) -> None:
        """Pool handles concurrent requests."""
        import concurrent.futures

        results = []
        errors = []

        def evaluate(fen: str) -> None:
            try:
                with pool.engine() as eng:
                    result = eng.evaluate(fen, depth=8)
                    results.append(result)
            except Exception as e:
                errors.append(e)

        positions = [starting_fen, complex_fen, starting_fen, complex_fen]

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(evaluate, fen) for fen in positions]
            concurrent.futures.wait(futures, timeout=30)

        assert len(errors) == 0, f"Errors: {errors}"
        assert len(results) == 4

    def test_acquire_release_cycle(self, pool: EnginePool, starting_fen: str) -> None:
        """Engines can be acquired and released multiple times."""
        for _ in range(5):
            with pool.engine() as eng:
                result = eng.evaluate(starting_fen, depth=5)
                assert result.depth >= 5

        health = pool.health_check()
        assert health["available"] == 2  # All engines returned
