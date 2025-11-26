#!/bin/bash

# Build gRPC stubs from protobuf definitions
# Generates TypeScript and Python stubs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PROTO_DIR="$ROOT_DIR/services/protos"

# Output directories
TS_OUT_DIR="$ROOT_DIR/packages/grpc-client/src/generated"
PY_STOCKFISH_OUT="$ROOT_DIR/services/stockfish/src/stockfish_service/generated"
PY_MAIA_OUT="$ROOT_DIR/services/maia/src/maia_service/generated"

echo "Building gRPC stubs from protobuf definitions..."
echo "Proto directory: $PROTO_DIR"

# Create output directories
mkdir -p "$TS_OUT_DIR"
mkdir -p "$PY_STOCKFISH_OUT"
mkdir -p "$PY_MAIA_OUT"

# Check for required tools
if ! command -v protoc &> /dev/null; then
    echo "Error: protoc is not installed"
    echo "Install with: brew install protobuf (macOS) or apt install protobuf-compiler (Linux)"
    exit 1
fi

# Generate Python stubs
echo "Generating Python stubs..."

# For Stockfish service
python -m grpc_tools.protoc \
    -I"$PROTO_DIR" \
    --python_out="$PY_STOCKFISH_OUT" \
    --pyi_out="$PY_STOCKFISH_OUT" \
    --grpc_python_out="$PY_STOCKFISH_OUT" \
    "$PROTO_DIR/common.proto" \
    "$PROTO_DIR/stockfish.proto"

# For Maia service
python -m grpc_tools.protoc \
    -I"$PROTO_DIR" \
    --python_out="$PY_MAIA_OUT" \
    --pyi_out="$PY_MAIA_OUT" \
    --grpc_python_out="$PY_MAIA_OUT" \
    "$PROTO_DIR/common.proto" \
    "$PROTO_DIR/maia.proto"

# Create __init__.py files for generated packages
touch "$PY_STOCKFISH_OUT/__init__.py"
touch "$PY_MAIA_OUT/__init__.py"

echo "Python stubs generated successfully"

# Generate TypeScript stubs (if grpc-tools is available)
if command -v grpc_tools_node_protoc &> /dev/null; then
    echo "Generating TypeScript stubs..."

    grpc_tools_node_protoc \
        --proto_path="$PROTO_DIR" \
        --js_out=import_style=commonjs,binary:"$TS_OUT_DIR" \
        --grpc_out=grpc_js:"$TS_OUT_DIR" \
        --ts_out=grpc_js:"$TS_OUT_DIR" \
        "$PROTO_DIR/common.proto" \
        "$PROTO_DIR/stockfish.proto" \
        "$PROTO_DIR/maia.proto"

    echo "TypeScript stubs generated successfully"
else
    echo "Note: grpc_tools_node_protoc not found, skipping TypeScript stub generation"
    echo "Install with: pnpm add -D grpc-tools grpc_tools_node_protoc_ts"

    # Create placeholder TypeScript file
    cat > "$TS_OUT_DIR/index.ts" << 'EOF'
/**
 * gRPC Generated Stubs
 *
 * This file is a placeholder. Run `make build-protos` after installing
 * grpc-tools to generate actual TypeScript stubs from the proto files.
 */

export const STUB_VERSION = '0.1.0';

// Placeholder types - will be replaced by generated code
export interface Position {
  fen: string;
}

export interface Move {
  san: string;
  uci: string;
}

export interface EvaluateRequest {
  fen: string;
  depth?: number;
  timeLimitMs?: number;
  multipv?: number;
  nodes?: number;
}

export interface EvaluateResponse {
  cp: number;
  mate: number;
  depth: number;
  bestLine: string[];
  alternatives: EvaluateResponse[];
}
EOF
fi

echo "Proto build complete!"
