# @chessbeast/debug-gui

Terminal-based Debug GUI for visualizing Ultra-Fast Coach analysis in real-time.

## Overview

A 4-panel terminal UI that connects to a running ChessBeast analysis via WebSocket, showing:

- **Chess Board**: ASCII board with evaluation bar and position info
- **LLM Stream**: Real-time LLM output with token counting
- **Tool Calls**: History of tool invocations with timing
- **Engine Analysis**: MultiPV lines, exploration progress, detected themes

## Quick Start

**Terminal 1** - Run analysis with debug server:
```bash
chessbeast analyze --input game.pgn --ultra-fast-coach --debug-gui
```

**Terminal 2** - Connect the debug GUI:
```bash
pnpm debug-gui
```

That's it! The GUI will connect to `ws://localhost:9222` by default.

## Usage

### Starting the Debug Server

Add `--debug-gui` to any analysis command:

```bash
# Default port (9222)
chessbeast analyze --input game.pgn --ultra-fast-coach --debug-gui

# Custom port
chessbeast analyze --input game.pgn --ultra-fast-coach --debug-gui 9333
```

### Connecting the Client

```bash
# From repository root (uses default port 9222)
pnpm debug-gui

# With custom URL
pnpm debug-gui ws://localhost:9333

# Or run directly
node packages/debug-gui/dist/bin/debug-gui.js ws://localhost:9222
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle between panels |
| `Shift+Tab` | Cycle panels (reverse) |
| `?` | Toggle help overlay |
| `p` | Pause/resume updates |
| `q` | Quit |

### Panel-Specific

| Panel | Key | Action |
|-------|-----|--------|
| Board | `f` | Flip board perspective |
| LLM | `j`/`k` | Scroll down/up |
| LLM | `g`/`G` | Scroll to top/bottom |
| Engine | `1-3` | Highlight PV line |
| Engine | `0` | Clear highlight |
| Tools | `Enter` | Expand/collapse tool call |

## Architecture

```
CLI Process                              Debug GUI Process
+------------------------+               +------------------------+
| Ultra-Fast Coach       |               | Ink TUI Application    |
| - Engine exploration   |  WebSocket    | - 4-panel layout       |
| - LLM annotation       | ----------->  | - Real-time updates    |
| - DebugGuiEmitter      |  (port 9222)  | - Keyboard navigation  |
+------------------------+               +------------------------+
```

The debug server runs inside the CLI process and emits events over WebSocket. The client is a separate process that can connect/disconnect without affecting analysis.

## Event Types

| Event | Description |
|-------|-------------|
| `position:update` | Current position (FEN, eval, move, classification) |
| `llm:stream_*` | LLM streaming (start, chunk, end) |
| `tool:call_*` | Tool invocations (start, result) |
| `engine:*` | Engine analysis, exploration progress, themes |
| `phase:*` | Pipeline phase events (start, progress, complete) |
| `session:*` | Game analysis lifecycle (start, end) |

## Development

```bash
# Build
pnpm --filter @chessbeast/debug-gui build

# Type check
pnpm --filter @chessbeast/debug-gui typecheck

# Run tests
pnpm --filter @chessbeast/debug-gui test
```
