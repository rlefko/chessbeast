#!/bin/bash
# =============================================================================
# Build Stockfish from source with SHA-based caching and multi-arch support
# =============================================================================
# This script builds Stockfish from the official repository (master branch)
# and caches the binary using the commit SHA to avoid unnecessary rebuilds.
#
# Environment Variables:
#   STOCKFISH_VOLUME  - Path to store built binary (default: /stockfish-bin)
#   FORCE_REBUILD     - Set to "1" to force rebuild even if binary exists
#
# Binary Naming: stockfish-{SHORT_SHA}-{ARCH}
# A symlink 'stockfish' points to the current binary
# =============================================================================
set -e

VOLUME_PATH="${STOCKFISH_VOLUME:-/stockfish-bin}"
REPO_PATH="/tmp/stockfish-src"
FORCE_REBUILD="${FORCE_REBUILD:-0}"

# =============================================================================
# Architecture Detection
# =============================================================================
detect_arch() {
    local machine
    machine=$(uname -m)

    case "$machine" in
        x86_64|amd64)
            # Check for BMI2 support (better performance on modern Intel/AMD)
            if grep -q bmi2 /proc/cpuinfo 2>/dev/null; then
                echo "x86-64-bmi2"
            else
                echo "x86-64-modern"
            fi
            ;;
        aarch64|arm64)
            echo "armv8"
            ;;
        *)
            echo "x86-64-modern"  # fallback
            ;;
    esac
}

ARCH=$(detect_arch)
echo "=== Stockfish Builder ==="
echo "Detected architecture: $ARCH"
echo "Volume path: $VOLUME_PATH"
echo "Force rebuild: $FORCE_REBUILD"
echo ""

# =============================================================================
# Clone or Update Repository
# =============================================================================
echo "Fetching Stockfish source..."
if [ -d "$REPO_PATH/.git" ]; then
    cd "$REPO_PATH"
    git fetch origin master
    git reset --hard origin/master
else
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git "$REPO_PATH"
    cd "$REPO_PATH"
fi

SHORT_SHA=$(git rev-parse --short HEAD)
BINARY_NAME="stockfish-${SHORT_SHA}-${ARCH}"

echo "Current commit: $SHORT_SHA"
echo "Binary name: $BINARY_NAME"
echo ""

# =============================================================================
# Check Cache
# =============================================================================
if [ "$FORCE_REBUILD" != "1" ] && [ -f "$VOLUME_PATH/$BINARY_NAME" ]; then
    echo "Binary $BINARY_NAME already exists, skipping build"
    # Ensure symlink is correct
    ln -sf "$BINARY_NAME" "$VOLUME_PATH/stockfish"
    echo "Symlink updated: stockfish -> $BINARY_NAME"
    exit 0
fi

# =============================================================================
# Build
# =============================================================================
echo "Building Stockfish $SHORT_SHA for $ARCH..."

# Remove old binaries to save space
rm -f "$VOLUME_PATH"/stockfish-*

cd src
make clean
make -j"$(nproc)" build ARCH="$ARCH"

# =============================================================================
# Install
# =============================================================================
echo "Installing binary..."
cp stockfish "$VOLUME_PATH/$BINARY_NAME"
chmod +x "$VOLUME_PATH/$BINARY_NAME"
ln -sf "$BINARY_NAME" "$VOLUME_PATH/stockfish"

echo ""
echo "=== Build Complete ==="
echo "Binary: $VOLUME_PATH/$BINARY_NAME"
echo "Symlink: $VOLUME_PATH/stockfish -> $BINARY_NAME"

# Verify
"$VOLUME_PATH/stockfish" --version || echo "(version check not supported)"
