.PHONY: all setup install build rebuild test lint clean run stop help setup-db download-eco download-lichess-elite build-db \
	build-stockfish-native run-docker rebuild-ts clean-ts-cache clean-py-cache clean-cache \
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

setup: install build-protos install-hooks setup-db build-stockfish-native  ## Full setup (build Stockfish from source, install deps, setup DB)
	@echo ""
	@echo "=== Setup Complete ==="
	@echo "Run 'make run' to start services"

build-stockfish-native:  ## Build Stockfish from source (latest master + SF16)
	bash scripts/build-stockfish-native.sh

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

rebuild: clean-cache build  ## Force rebuild (clean cache + build)
	@echo "Rebuild complete"

rebuild-ts: clean-ts-cache build-ts  ## Force rebuild TypeScript only
	@echo "TypeScript rebuild complete"

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
# Services (native Stockfish + Docker Maia)
# ===========================================

run: stop build-stockfish-native  ## Start all services (native Stockfish + Docker Maia)
	@echo "Starting services..."
	@# Verify Stockfish binaries exist after build
	@if [ ! -L "bin/stockfish/stockfish" ] || [ ! -f "bin/stockfish/stockfish-16" ]; then \
		echo "Error: Stockfish build failed or binaries missing."; \
		exit 1; \
	fi
	@# Check for gRPC stubs
	@if [ ! -f "services/stockfish16/src/stockfish16_service/generated/stockfish16_pb2.py" ]; then \
		echo "gRPC stubs not found. Building..."; \
		$(MAKE) build-protos; \
	fi
	@# Start Maia via Docker (optional - continues if Docker not running)
	@$(DOCKER_COMPOSE) up -d maia 2>/dev/null || echo "Note: Maia not started (Docker not running)"
	@# Start native Stockfish services in background
	@STOCKFISH_PATH=$(PWD)/bin/stockfish/stockfish STOCKFISH_POOL_SIZE=1 \
		uv run python -m stockfish_service.server &
	@STOCKFISH16_PATH=$(PWD)/bin/stockfish/stockfish-16 STOCKFISH16_POOL_SIZE=1 \
		uv run python -m stockfish16_service.server &
	@sleep 2
	@echo ""
	@echo "Services started:"
	@echo "  Stockfish:   localhost:50051"
	@echo "  Stockfish16: localhost:50053"
	@echo "  Maia:        localhost:50052 (requires Docker)"

stop:  ## Stop all services
	@echo "Stopping services..."
	@pkill -9 -f "stockfish_service.server" 2>/dev/null || true
	@pkill -9 -f "stockfish16_service.server" 2>/dev/null || true
	@lsof -ti:50051 | xargs kill -9 2>/dev/null || true
	@lsof -ti:50053 | xargs kill -9 2>/dev/null || true
	@$(DOCKER_COMPOSE) stop maia 2>/dev/null || true
	@echo "Services stopped"

run-docker: docker-up  ## Start all services via Docker (alternative)

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

clean-ts-cache:  ## Clean TypeScript build cache (keeps node_modules)
	rm -rf packages/*/dist
	rm -rf packages/*/*.tsbuildinfo
	rm -rf .turbo

clean-py-cache:  ## Clean Python cache (keeps .venv)
	find services -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find services -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true

clean-cache: clean-ts-cache clean-py-cache  ## Clean all caches (keeps node_modules and .venv)

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
