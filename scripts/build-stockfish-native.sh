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
# Build latest Stockfish from master (with SHA caching)
# =============================================================================
SF_LATEST_DIR="/tmp/stockfish-latest"
SF_SHA_FILE="$BIN_DIR/.stockfish-sha"

echo "Checking latest Stockfish from master..."

# Clone or update repo
if [ -d "$SF_LATEST_DIR/.git" ]; then
    cd "$SF_LATEST_DIR"
    git fetch origin master --depth 1
    git reset --hard origin/master
else
    rm -rf "$SF_LATEST_DIR"
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git "$SF_LATEST_DIR"
    cd "$SF_LATEST_DIR"
fi

CURRENT_SHA=$(git rev-parse --short HEAD)
CACHED_SHA=""
if [ -f "$SF_SHA_FILE" ]; then
    CACHED_SHA=$(cat "$SF_SHA_FILE")
fi

echo "Current SHA: $CURRENT_SHA"
echo "Cached SHA:  ${CACHED_SHA:-none}"

if [ "$FORCE_REBUILD" = "1" ] || [ "$CURRENT_SHA" != "$CACHED_SHA" ] || [ ! -f "$BIN_DIR/stockfish" ]; then
    echo "Building Stockfish $CURRENT_SHA..."
    cd "$SF_LATEST_DIR/src"
    make clean
    make -j"$CPU_COUNT" build ARCH="$ARCH"
    cp stockfish "$BIN_DIR/stockfish"
    chmod +x "$BIN_DIR/stockfish"
    echo "$CURRENT_SHA" > "$SF_SHA_FILE"
    echo "Built: $BIN_DIR/stockfish"
else
    echo "Stockfish is up to date, skipping build"
fi
"$BIN_DIR/stockfish" --version 2>/dev/null || true
echo ""

# =============================================================================
# Build Stockfish 16 (one-time, fixed version)
# =============================================================================
SF16_DIR="/tmp/stockfish-16"

if [ -f "$BIN_DIR/stockfish16" ] && [ "$FORCE_REBUILD" != "1" ]; then
    echo "Stockfish 16 already built, skipping"
else
    echo "Building Stockfish 16..."
    if [ ! -d "$SF16_DIR/.git" ]; then
        rm -rf "$SF16_DIR"
        git clone --depth 1 --branch sf_16 https://github.com/official-stockfish/Stockfish.git "$SF16_DIR"
    fi
    cd "$SF16_DIR/src"
    make clean
    make -j"$CPU_COUNT" build ARCH="$ARCH"
    cp stockfish "$BIN_DIR/stockfish16"
    chmod +x "$BIN_DIR/stockfish16"
    echo "Built: $BIN_DIR/stockfish16"
fi
"$BIN_DIR/stockfish16" --version 2>/dev/null || true
echo ""

# =============================================================================
# Done
# =============================================================================
echo "=== Build Complete ==="
echo "Binaries:"
echo "  $BIN_DIR/stockfish (master @ $CURRENT_SHA)"
echo "  $BIN_DIR/stockfish16 (SF16)"
