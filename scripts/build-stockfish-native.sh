#!/bin/bash
# =============================================================================
# Build Stockfish from source for native architecture (Apple Silicon optimized)
# =============================================================================
# Builds both latest Stockfish (master) and Stockfish 16 for maximum performance
# on the host machine. Uses SHA-based caching to skip rebuilds when unchanged.
#
# Usage: bash scripts/build-stockfish-native.sh
# Force rebuild: FORCE_REBUILD=1 bash scripts/build-stockfish-native.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_ROOT/bin/stockfish"
FORCE_REBUILD="${FORCE_REBUILD:-0}"

# Detect architecture
detect_arch() {
    local machine=$(uname -m)
    local os=$(uname -s)

    case "$machine" in
        arm64|aarch64)
            if [ "$os" = "Darwin" ]; then
                echo "apple-silicon"
            else
                echo "armv8"
            fi
            ;;
        x86_64|amd64)
            echo "x86-64-modern"
            ;;
        *)
            echo "x86-64-modern"
            ;;
    esac
}

# Get CPU count for parallel build
get_cpu_count() {
    if [ "$(uname -s)" = "Darwin" ]; then
        sysctl -n hw.ncpu
    else
        nproc
    fi
}

ARCH=$(detect_arch)
CPU_COUNT=$(get_cpu_count)

echo "=== Stockfish Native Builder ==="
echo "Architecture: $ARCH"
echo "CPU cores: $CPU_COUNT"
echo "Output: $BIN_DIR"
echo "Force rebuild: $FORCE_REBUILD"
echo ""

mkdir -p "$BIN_DIR"

# =============================================================================
# Build latest Stockfish from master (with SHA-based naming)
# =============================================================================
SF_LATEST_DIR="/tmp/stockfish-latest"

# Clean up legacy SHA file if it exists
rm -f "$BIN_DIR/.stockfish-sha"

echo "Checking latest Stockfish from master..."

# Clone or update repo (validate git repo is not corrupted)
if [ -d "$SF_LATEST_DIR/.git" ] && git -C "$SF_LATEST_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    cd "$SF_LATEST_DIR"
    git fetch origin master --depth 1
    git reset --hard origin/master
else
    rm -rf "$SF_LATEST_DIR"
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git "$SF_LATEST_DIR"
    cd "$SF_LATEST_DIR"
fi

CURRENT_SHA=$(git rev-parse --short HEAD)
BINARY_NAME="stockfish-${CURRENT_SHA}"

echo "Current SHA: $CURRENT_SHA"
echo "Binary name: $BINARY_NAME"

if [ "$FORCE_REBUILD" = "1" ] || [ ! -f "$BIN_DIR/$BINARY_NAME" ]; then
    echo "Building Stockfish $CURRENT_SHA..."

    # Clean up old stockfish-* binaries (except stockfish-16)
    find "$BIN_DIR" -maxdepth 1 -name "stockfish-*" ! -name "stockfish-16" -type f -delete 2>/dev/null || true

    cd "$SF_LATEST_DIR/src"
    make clean
    make -j"$CPU_COUNT" build ARCH="$ARCH"
    cp stockfish "$BIN_DIR/$BINARY_NAME"
    chmod +x "$BIN_DIR/$BINARY_NAME"
    echo "Built: $BIN_DIR/$BINARY_NAME"
else
    echo "Stockfish $CURRENT_SHA is up to date, skipping build"
fi

# Always ensure symlink points to current version
ln -sf "$BINARY_NAME" "$BIN_DIR/stockfish"
echo "Symlink: stockfish -> $BINARY_NAME"

"$BIN_DIR/stockfish" --version 2>/dev/null || true
echo ""

# =============================================================================
# Build Stockfish 16 (one-time, fixed version)
# =============================================================================
SF16_DIR="/tmp/stockfish-16"

if [ -f "$BIN_DIR/stockfish-16" ] && [ "$FORCE_REBUILD" != "1" ]; then
    echo "Stockfish 16 already built, skipping"
else
    echo "Building Stockfish 16..."
    # Validate git repo is not corrupted before using it
    if [ ! -d "$SF16_DIR/.git" ] || ! git -C "$SF16_DIR" rev-parse --git-dir >/dev/null 2>&1; then
        rm -rf "$SF16_DIR"
        git clone --depth 1 --branch sf_16 https://github.com/official-stockfish/Stockfish.git "$SF16_DIR"
    fi
    cd "$SF16_DIR/src"
    make clean
    make -j"$CPU_COUNT" build ARCH="$ARCH"
    cp stockfish "$BIN_DIR/stockfish-16"
    chmod +x "$BIN_DIR/stockfish-16"
    echo "Built: $BIN_DIR/stockfish-16"
fi

# Create backward-compat symlink
ln -sf "stockfish-16" "$BIN_DIR/stockfish16"
echo "Symlink: stockfish16 -> stockfish-16"

"$BIN_DIR/stockfish-16" --version 2>/dev/null || true
echo ""

# =============================================================================
# Done
# =============================================================================
echo "=== Build Complete ==="
echo "Binaries:"
echo "  $BIN_DIR/stockfish-$CURRENT_SHA (symlink: stockfish)"
echo "  $BIN_DIR/stockfish-16 (symlink: stockfish16)"
