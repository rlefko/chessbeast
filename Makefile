.PHONY: all setup install build test lint clean run help setup-db download-eco download-lichess-elite build-db

# Default target
all: help

# ===========================================
# Setup & Installation
# ===========================================

setup: install build-protos install-hooks setup-db  ## Full setup (install deps, build protos, setup DB)
	@echo "Setup complete!"

install: install-ts install-py  ## Install all dependencies (npm + uv)
	@echo "All dependencies installed"

install-ts:
	pnpm install

install-py:
	uv sync --all-packages

install-hooks:
	bash scripts/install-hooks.sh

# ===========================================
# Database Setup
# ===========================================

setup-db: download-eco download-lichess-elite build-db  ## Setup databases (download data, build SQLite)

download-eco:  ## Download ECO opening data
	bash scripts/download-eco.sh

download-lichess-elite:  ## Download Lichess Elite games
	bash scripts/download-lichess-elite.sh

build-db: build-ts  ## Build database files from downloaded data
	@echo "Building ECO database..."
	pnpm exec node packages/database/dist/loaders/eco-loader.js
	@echo "Building Lichess Elite database (this may take a while)..."
	pnpm exec node packages/database/dist/loaders/lichess-loader.js 100000
	@echo "Databases built successfully"

# ===========================================
# Build
# ===========================================

build: build-protos build-ts  ## Build all packages
	@echo "Build complete"

build-ts:
	pnpm run build

build-protos:  ## Generate gRPC stubs from protos
	bash scripts/build-protos.sh

# ===========================================
# Testing
# ===========================================

test: test-ts test-py  ## Run all tests
	@echo "All tests passed"

test-ts:
	pnpm run test

test-py:
	uv run pytest

test-ts-watch:
	pnpm run test:watch

test-integration:  ## Run integration tests
	pnpm vitest run --project cli --testPathPattern integration

test-golden:  ## Run golden tests
	pnpm vitest run --project cli --testPathPattern golden

test-quality:  ## Run quality validation tests
	pnpm vitest run --config tests/vitest.config.ts --testPathPattern quality

test-benchmark:  ## Run performance benchmarks
	pnpm vitest run --config tests/vitest.config.ts --testPathPattern benchmarks

test-all: test test-integration test-golden test-quality  ## Run all test suites
	@echo "All test suites passed"

test-ci: test-all test-benchmark  ## Full CI test suite with benchmarks
	@echo "CI tests complete"

# ===========================================
# Linting & Formatting
# ===========================================

lint: lint-ts lint-py  ## Lint all code
	@echo "Lint complete"

lint-ts:
	pnpm run lint
	pnpm run format:check

lint-py:
	uv run ruff check services/
	uv run mypy services/

lint-fix: lint-fix-ts lint-fix-py  ## Auto-fix lint issues
	@echo "Lint fixes applied"

lint-fix-ts:
	pnpm run lint:fix
	pnpm run format

lint-fix-py:
	uv run ruff check --fix services/
	uv run ruff format services/

# ===========================================
# Type Checking
# ===========================================

typecheck: typecheck-ts typecheck-py  ## Type check all code

typecheck-ts:
	pnpm run typecheck

typecheck-py:
	uv run mypy services/

# ===========================================
# Services
# ===========================================

run: run-stockfish run-maia  ## Start all services

run-stockfish:  ## Start Stockfish service only
	uv run python -m stockfish_service.server

run-maia:  ## Start Maia service only
	uv run python -m maia_service.server

# ===========================================
# Docker
# ===========================================

docker-build:  ## Build Docker images
	docker compose -f docker/docker-compose.yml build

docker-up:  ## Start services via docker-compose
	docker compose -f docker/docker-compose.yml up -d

docker-down:  ## Stop services
	docker compose -f docker/docker-compose.yml down

docker-logs:  ## View service logs
	docker compose -f docker/docker-compose.yml logs -f

# ===========================================
# Clean
# ===========================================

clean: clean-ts clean-py  ## Clean all build artifacts

clean-ts:
	rm -rf packages/*/dist
	rm -rf packages/*/*.tsbuildinfo
	rm -rf node_modules
	rm -rf .turbo

clean-py:
	find services -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf .venv

# ===========================================
# Help
# ===========================================

help:  ## Show this help
	@echo "ChessBeast Development Commands"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
