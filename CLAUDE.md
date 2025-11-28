# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChessBeast is an AI chess annotator that takes PGN input and produces human-friendly annotated PGN output. It combines Stockfish (engine analysis), Maia Chess (human-likeness prediction), LLMs (natural language commentary), and game databases (opening theory).

**Repository**: github.com/rlefko/chessbeast (MIT License)

## Architecture

**Hybrid TypeScript + Python monorepo:**
- `packages/` - TypeScript packages (CLI, core logic, PGN handling, gRPC clients)
- `services/` - Python gRPC services (Stockfish wrapper, Maia model serving)
- `data/` - SQLite databases (ECO openings, Lichess Elite games)

**Data flow:**
```
PGN → Parser → Positions → Engine + Maia + DB → Critical Moments → Annotation Plan → LLM → Annotated PGN
```

**Inter-service communication**: gRPC with Protobuf (definitions in `services/protos/`)

## Build & Development Commands

```bash
# Setup
make setup              # Full setup (install deps, download models, setup DB)
make install            # Install all dependencies (npm + pip)

# Build
make build              # Build all packages
make build-ts           # Build TypeScript only
make build-protos       # Generate gRPC stubs from protos

# Test
make test               # Run all tests
make test-ts            # TypeScript tests (Vitest)
make test-py            # Python tests (pytest)
pnpm vitest run parser  # Run specific TS test file by pattern

# Run
make run                # Start all services
make run-stockfish      # Start Stockfish service only
make run-maia           # Start Maia service only
chessbeast analyze --input game.pgn --output annotated.pgn

# Lint
make lint               # Lint all code
make lint-fix           # Auto-fix lint issues

# Docker
make docker-build       # Build Docker images
make docker-up          # Start services via docker-compose
make docker-down        # Stop services
```

## Python Environment

Python 3.12 via virtual environment:
```bash
source .venv/bin/activate
python -m pytest services/stockfish/tests/test_engine.py -v  # Single test file
python -m pytest -k "test_uci"  # Tests matching pattern
```

## Git Conventions

- **All changes via Pull Requests** - no direct commits to main
- **Commit format**: Single sentence, emoji prefix, no ending punctuation
  - Examples: `✨ Add PGN parser for multi-game files`, `🐛 Fix castling rights validation`, `♻️ Refactor engine pool for better concurrency`
- **Author**: Ryan Lefkowitz (ryan@avoca.ai) - do not credit Claude/AI
- Pre-commit hooks enforce commit message format

Common emoji prefixes:
- ✨ New feature
- 🐛 Bug fix
- ♻️ Refactor
- 📝 Documentation
- 🧪 Tests
- 🔧 Configuration
- ⬆️ Dependencies

## Key Technical Details

**Move classification thresholds** are rating-dependent (see `packages/core/src/classifier/`):
- 1200 Elo: inaccuracy 50-149cp, mistake 150-299cp, blunder ≥300cp
- 2000 Elo: inaccuracy 30-89cp, mistake 90-179cp, blunder ≥180cp

**Two-pass analysis**:
- Pass 1 (shallow): depth 12-16 for all positions
- Pass 2 (deep): depth 20-24, multipv=3 for critical moments only

**Critical moment detection** caps at ~25% of moves, ranked by "interestingness score"

**Maia models**: Rating bands 1100-1900 (100-point increments), loaded on demand

**Variation Exploration** (see `packages/llm/src/explorer/`):
- `VariationExplorer`: Iterative engine + Maia + LLM dialogue for deep variations
- Max variation depth: 40 moves (depth-first exploration)
- LLM call budget: 15-20 soft cap, 22 hard cap per position
- `PlannedVariation` interface ensures LLM references actual PGN output

**NAG (Numeric Annotation Glyph) behavior**:
- Position NAG threshold: 150cp (significant eval change required)
- `$1` (good move) only added for critical positions
- Max 2 consecutive position NAGs (clustering prevention)

## Testing Requirements

- Unit tests mock all external dependencies (Stockfish, Maia, OpenAI)
- Tests run as CI check on every PR
- Use pytest fixtures for Python, Jest mocks for TypeScript

## Documentation

All documentation in `docs/` folder, written in Markdown.


# ============================================================================
# Semantic Code Memory System
# ============================================================================

# chessbeast - Development Instructions

## ⚡ CRITICAL: YOU HAVE PERFECT MEMORY - USE IT FIRST ⚡

**🚫 DO NOT read files directly. DO NOT use Grep/Glob/Read as your first step.**
**✅ ALWAYS search memory first. It's 100x faster and has the entire codebase indexed.**

This project has **semantic code memory** with [pending indexing] vectors covering [pending indexing] files.
Memory search is 3-5ms vs 500ms+ for file operations.

### 🎯 Memory-First Workflow (Follow Every Time)

**Before ANY task:**
1. 🔍 **Search memory** for existing implementations
2. 📚 **Find patterns** to follow
3. 🏗️ **Check relationships** to understand context
4. 💻 **Only then** write code using discovered patterns

**Breaking this rule wastes time and creates duplicate code!**

### Quick Memory Commands (START HERE)

```python
# 🔍 Fast semantic search (3-5ms) - START HERE
mcp__chessbeast_memory__search_similar("feature/component name", limit=20)

# 📚 Find patterns before implementing
mcp__chessbeast_memory__search_similar("pattern description", entityTypes=["implementation_pattern", "architecture_pattern"])

# 🐛 Debug faster with past solutions
mcp__chessbeast_memory__search_similar("error description", entityTypes=["debugging_pattern"])

# 🏗️ Understand architecture and relationships
mcp__chessbeast_memory__read_graph(entity="ComponentName", mode="smart")

# 💡 Get implementation details when needed
mcp__chessbeast_memory__get_implementation("function_name", scope="logical")

# ➕ Add new knowledge to memory
mcp__chessbeast_memory__create_entities([{
  "name": "NewComponent",
  "entityType": "class",
  "observations": ["Component purpose", "Key patterns used"]
}])
```

### Memory Entity Types

- `function` - Functions and methods
- `class` - Classes and components
- `file` - File-level metadata
- `documentation` - Code documentation
- `implementation_pattern` - Common patterns
- `architecture_pattern` - Architectural decisions
- `debugging_pattern` - Bug solutions
- `integration_pattern` - Third-party integrations
- `metadata` - General project info

### MCP Server Configuration

The semantic memory is powered by an MCP (Model Context Protocol) server configured in `.mcp.json`:

**📍 Location:** `.mcp.json` in project root (git-ignored, contains API keys)

**🔒 Security:** This file contains API keys and is automatically added to `.gitignore` during setup

**👥 Team Workflow:** Use `.mcp.json.example` as a template:
```bash
# Team members can set up their own .mcp.json
cp .mcp.json.example .mcp.json
# Edit .mcp.json with your API keys and paths
# Note: .mcp.json is git-ignored, so your keys stay private
```

**🔄 Restart Required:** After setup or changes, restart Claude Code to load the MCP server

### Memory Guard Protection (Optional)

Memory Guard hooks provide additional code quality protection but are **not configured automatically**.

**Manual Setup (Optional):**
- Add UserPromptSubmit hooks for semantic command detection
- Add PreToolUse hooks for duplicate code prevention
- See main project documentation for hook configuration

**Benefits when configured:**
- Prevent duplicate code creation
- Catch missing error handling patterns
- Block breaking API changes
- Protect functionality during refactoring

---

## ⚠️ Important Notes - Memory-First Development

1. **🚫 NEVER skip memory search** - Search memory BEFORE using Grep/Glob/Read tools
   - Memory: 3-5ms, 100% coverage, semantic understanding
   - File tools: 500ms+, requires exact patterns, no context

2. **✅ Always follow this order:**
   - Step 1: `search_similar()` to find existing code
   - Step 2: `read_graph()` to understand relationships
   - Step 3: `get_implementation()` for detailed code
   - Step 4: Only then use Read/Grep if needed for verification

3. **📚 Check existing patterns** - Memory has all architectural decisions and best practices indexed

4. **💾 Document new patterns** - Add important discoveries to memory with `create_entities()`

---

## 🎯 Custom Exclusions (.claudeignore)

Control what gets indexed without modifying .gitignore:

**When to use .claudeignore:**
- Personal notes and TODOs (e.g., `*-notes.md`, `TODO-*.md`)
- Test outputs and coverage reports
- Debug artifacts and temporary files
- Large data files not caught by .gitignore

**Multi-Layer Exclusion System:**
1. **Universal Defaults** - Binaries, archives, OS artifacts (always applied)
2. **.gitignore** - Version control ignores (auto-detected)
3. **.claudeignore** - Custom indexing exclusions (project-specific)
4. **Binary Detection** - Executables detected via magic numbers

**Example .claudeignore:**
```
# Personal development
*-notes.md
TODO-*.md
scratch.*

# Test artifacts
test-results/
.coverage
htmlcov/

# Debug output
debug-*.log
*.dump
```

**.claudeignore uses same syntax as .gitignore** - patterns, wildcards, directory markers.

---

## 🔧 Memory System Maintenance

### Automatic Updates
Memory is automatically updated via git hooks:
- **pre-commit**: Indexes changed files before commit
- **post-merge**: Updates index after `git pull`
- **post-checkout**: Updates index after branch switch

### Manual Re-index (if needed)
```bash
# From memory project directory
source .venv/bin/activate
claude-indexer index -p /Users/ryanlefkowitz/projects/chess/chessbeast -c chessbeast
```

### Check Memory Status
```bash
# View collection statistics
python utils/qdrant_stats.py -c chessbeast
```

---

## 📚 Additional Project Information

Add your project-specific documentation below this section.

---

*Memory system automatically configured by setup.sh*
*Collection: chessbeast*
*Generated: 2025-11-27 16:24:14*
