.PHONY: all setup setup-native install build test lint clean run help setup-db download-eco download-lichess-elite build-db download-stockfish \
	run-native stop-native run-local-stockfish run-local-stockfish16 run-local-maia \
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

setup: install build-protos install-hooks setup-db docker-up  ## Full setup (install deps, build protos, setup DB, start services via Docker)
	@echo "Setup complete!"
	@echo ""
	@echo "Services running:"
	@echo "  Stockfish:   localhost:50051"
	@echo "  Stockfish16: localhost:50053"
	@echo "  Maia:        localhost:50052"
	@echo ""
	@echo "Run 'make docker-health' to check service status"
	@echo ""
	@echo "TIP: On Apple Silicon, use 'make setup-native' for better Stockfish performance"

setup-native: install build-protos install-hooks setup-db download-stockfish  ## Setup for Apple Silicon (native Stockfish + Docker Maia)
	@echo "Setup complete! Use 'make run-native' to start services."
	@echo ""
	@echo "This mode runs native Stockfish for optimal Apple Silicon performance."

download-stockfish:  ## Download Stockfish binary for local development (optional)
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
# Services (Docker is the standard way to run services)
# ===========================================

run: docker-up  ## Start all services (via Docker)

# Native service commands (recommended for Apple Silicon)
run-native:  ## Start services optimally (native Stockfish + Docker Maia) - best for Apple Silicon
	@echo "Starting services in hybrid mode (native Stockfish, Docker Maia)..."
	@# Check for native Stockfish binary
	@if [ ! -f "bin/stockfish/stockfish" ]; then \
		echo "Native Stockfish binary not found. Downloading..."; \
		$(MAKE) download-stockfish; \
	fi
	@# Start Maia via Docker
	@echo "Starting Maia service via Docker..."
	$(DOCKER_COMPOSE) up -d maia
	@# Start native Stockfish services in background
	@echo "Starting native Stockfish services..."
	@STOCKFISH_PATH=$(PWD)/bin/stockfish/stockfish STOCKFISH_POOL_SIZE=1 \
		uv run python -m stockfish_service.server &
	@STOCKFISH16_PATH=$(PWD)/bin/stockfish/stockfish STOCKFISH16_POOL_SIZE=1 \
		uv run python -m stockfish16_service.server &
	@echo ""
	@echo "Services started:"
	@echo "  Stockfish (native): localhost:50051"
	@echo "  Stockfish16 (native): localhost:50053"
	@echo "  Maia (Docker): localhost:50052"
	@echo ""
	@echo "Run 'make stop-native' to stop all services"

stop-native:  ## Stop native services and Docker Maia
	@echo "Stopping services..."
	@pkill -f "stockfish_service.server" 2>/dev/null || true
	@pkill -f "stockfish16_service.server" 2>/dev/null || true
	$(DOCKER_COMPOSE) stop maia
	@echo "All services stopped"

# Local service commands (for development/debugging)
run-local-stockfish:  ## [Dev] Start Stockfish service locally (requires local binary)
	STOCKFISH_PATH=$(PWD)/bin/stockfish/stockfish STOCKFISH_POOL_SIZE=1 \
		uv run python -m stockfish_service.server

run-local-stockfish16:  ## [Dev] Start Stockfish 16 service locally
	STOCKFISH16_PATH=$(PWD)/bin/stockfish/stockfish STOCKFISH16_POOL_SIZE=1 \
		uv run python -m stockfish16_service.server

run-local-maia:  ## [Dev] Start Maia service locally
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
