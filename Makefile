.PHONY: all setup install build test lint clean run help setup-db download-eco download-lichess-elite build-db download-stockfish \
	docker-build docker-build-stockfish docker-build-stockfish16 docker-build-maia \
	docker-up docker-down docker-restart docker-rebuild-stockfish \
	docker-logs docker-logs-stockfish docker-logs-stockfish16 docker-logs-maia \
	docker-ps docker-health docker-clean docker-prune \
	docker-shell-stockfish docker-shell-stockfish16 docker-shell-maia

# Default target
all: help

# ===========================================
# Setup & Installation
# ===========================================

setup: install build-protos install-hooks setup-db download-stockfish  ## Full setup (install deps, build protos, setup DB, Stockfish)
	@echo "Setup complete!"

download-stockfish:  ## Download Stockfish binary for current platform
	bash scripts/download-stockfish.sh

install: install-ts install-py  ## Install all dependencies (npm + uv)
	@echo "All dependencies installed"

install-ts:
	pnpm install

install-py: check-uv  ## Install Python dependencies with uv
	@echo "Setting up Python virtual environment..."
	uv venv --python 3.12 .venv 2>/dev/null || true
	uv sync --all-packages
	@echo "Python dependencies installed in .venv/"

check-uv:
	@command -v uv >/dev/null 2>&1 || { \
		echo "Error: uv is required but not installed."; \
		echo "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		echo "Or see: https://docs.astral.sh/uv/getting-started/installation/"; \
		exit 1; \
	}

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
	cd packages/cli && pnpm vitest run integration

test-golden:  ## Run golden tests
	cd packages/cli && pnpm vitest run golden

test-quality:  ## Run quality validation tests
	pnpm vitest run --config tests/vitest.config.ts quality

test-benchmark:  ## Run performance benchmarks
	pnpm vitest run --config tests/vitest.config.ts benchmarks

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

run: run-stockfish run-stockfish16 run-maia  ## Start all services

run-stockfish:  ## Start Stockfish service only
	uv run python -m stockfish_service.server

run-stockfish16:  ## Start Stockfish 16 service only (classical eval)
	uv run python -m stockfish16_service.server

run-maia:  ## Start Maia service only
	uv run python -m maia_service.server

# ===========================================
# Docker
# ===========================================

DOCKER_COMPOSE = docker compose -f docker/docker-compose.yml

# Build targets
docker-build:  ## Build all Docker images
	$(DOCKER_COMPOSE) build

docker-build-stockfish:  ## Build Stockfish service image only
	$(DOCKER_COMPOSE) build stockfish-builder stockfish

docker-build-stockfish16:  ## Build Stockfish16 service image only
	$(DOCKER_COMPOSE) build stockfish16-builder stockfish16

docker-build-maia:  ## Build Maia service image only
	$(DOCKER_COMPOSE) build maia

# Start/stop targets
docker-up:  ## Start all services (builds binaries if needed)
	$(DOCKER_COMPOSE) up -d

docker-down:  ## Stop all services
	$(DOCKER_COMPOSE) down

docker-restart:  ## Restart all services
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) up -d

# Force rebuild Stockfish from latest master
docker-rebuild-stockfish:  ## Force rebuild Stockfish from latest master
	$(DOCKER_COMPOSE) run --rm -e FORCE_REBUILD=1 stockfish-builder
	$(DOCKER_COMPOSE) restart stockfish

# Logs
docker-logs:  ## View all service logs (follow)
	$(DOCKER_COMPOSE) logs -f

docker-logs-stockfish:  ## View Stockfish service logs
	$(DOCKER_COMPOSE) logs -f stockfish

docker-logs-stockfish16:  ## View Stockfish16 service logs
	$(DOCKER_COMPOSE) logs -f stockfish16

docker-logs-maia:  ## View Maia service logs
	$(DOCKER_COMPOSE) logs -f maia

# Status and health
docker-ps:  ## Show service status
	$(DOCKER_COMPOSE) ps

docker-health:  ## Check service health status
	@echo "=== Service Health ==="
	@docker inspect chessbeast-stockfish --format='Stockfish: {{.State.Health.Status}}' 2>/dev/null || echo "Stockfish: not running"
	@docker inspect chessbeast-stockfish16 --format='Stockfish16: {{.State.Health.Status}}' 2>/dev/null || echo "Stockfish16: not running"
	@docker inspect chessbeast-maia --format='Maia: {{.State.Health.Status}}' 2>/dev/null || echo "Maia: not running"

# Cleanup
docker-clean:  ## Remove containers, images, and volumes
	$(DOCKER_COMPOSE) down --rmi local --volumes --remove-orphans

docker-prune:  ## Remove all unused Docker resources (use with caution)
	docker system prune -af --volumes

# Shell access
docker-shell-stockfish:  ## Open shell in Stockfish container
	docker exec -it chessbeast-stockfish /bin/bash

docker-shell-stockfish16:  ## Open shell in Stockfish16 container
	docker exec -it chessbeast-stockfish16 /bin/bash

docker-shell-maia:  ## Open shell in Maia container
	docker exec -it chessbeast-maia /bin/bash

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
