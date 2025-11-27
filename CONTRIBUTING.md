# Contributing to ChessBeast

Thank you for your interest in contributing to ChessBeast! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.12+
- pnpm (for TypeScript packages)
- uv (for Python services)
- Stockfish chess engine

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/rlefko/chessbeast.git
cd chessbeast

# Run full setup (installs deps, downloads models, sets up databases)
make setup

# Or install dependencies only
make install
```

### Building

```bash
# Build everything
make build

# Build TypeScript only
make build-ts

# Generate gRPC stubs from proto files
make build-protos
```

### Running Services

```bash
# Start all services (Stockfish + Maia)
make run

# Start individual services
make run-stockfish
make run-maia

# Using Docker
make docker-up
```

## Project Structure

```
chessbeast/
├── packages/           # TypeScript packages
│   ├── cli/           # CLI entry point
│   ├── core/          # Analysis pipeline
│   ├── pgn/           # PGN parsing/rendering
│   ├── grpc-client/   # gRPC clients
│   ├── database/      # Database clients
│   ├── llm/           # LLM integration
│   └── test-utils/    # Test utilities
├── services/          # Python gRPC services
│   ├── stockfish/     # Engine wrapper
│   ├── maia/          # Maia2 model serving
│   └── protos/        # Protobuf definitions
├── data/              # SQLite databases
├── scripts/           # Setup scripts
├── tests/             # Integration tests
└── docs/              # Documentation
```

## Code Style

### TypeScript

We use ESLint and Prettier for TypeScript code:

```bash
# Check linting
make lint

# Auto-fix issues
make lint-fix
```

Key conventions:
- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters and return values
- Use async/await over raw Promises

### Python

We use MyPy for type checking and follow PEP 8:

```bash
# Run Python linting
cd services && uv run mypy .
```

Key conventions:
- Use type hints for all functions
- Use `async def` for async code
- Follow PEP 8 naming conventions

## Testing

### Running Tests

```bash
# Run all tests
make test

# TypeScript tests only
make test-ts

# Python tests only
make test-py

# Run specific test file
pnpm vitest run parser
python -m pytest services/stockfish/tests/test_engine.py -v
```

### Writing Tests

- Unit tests should mock external dependencies (Stockfish, Maia, OpenAI)
- Use the fixtures in `packages/test-utils/src/fixtures/` for test data
- Integration tests go in the `tests/` directory

Example test structure:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ComponentName', () => {
  it('should do something specific', () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = componentFunction(input);

    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

## Commit Messages

All commits must follow this format:
- Single sentence
- Emoji prefix
- No ending punctuation

### Emoji Prefixes

| Emoji | Meaning |
|-------|---------|
| ✨ | New feature |
| 🐛 | Bug fix |
| ♻️ | Refactor |
| 📝 | Documentation |
| 🧪 | Tests |
| 🔧 | Configuration |
| ⬆️ | Dependencies |
| 🎨 | Style/formatting |
| ⚡ | Performance |
| 🔒 | Security |

### Examples

```
✨ Add PGN parser for multi-game files
🐛 Fix castling rights validation
♻️ Refactor engine pool for better concurrency
📝 Update installation instructions
🧪 Add unit tests for move classification
```

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the code style guidelines
   - Add tests for new functionality
   - Update documentation if needed

3. **Run tests locally**
   ```bash
   make test
   make lint
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "✨ Add your feature description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Include a clear description of what the PR does
- Reference any related issues
- Ensure all CI checks pass
- Request review from maintainers

## Architecture Guidelines

When making changes, consider:

1. **Package boundaries**: Keep packages focused on their responsibility
2. **Type safety**: Use TypeScript types and avoid `any`
3. **Error handling**: Use proper error types and handle failures gracefully
4. **Testing**: New features should include tests
5. **Documentation**: Update docs for user-facing changes

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- For questions, open a discussion on GitHub

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
