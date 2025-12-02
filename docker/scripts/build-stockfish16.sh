#!/bin/bash
# =============================================================================
# Build Stockfish 16 from source (sf_16 tag) - one-time build
# =============================================================================
# Stockfish 16 is required for classical evaluation (the 'eval' command was
# removed in later versions). This script builds SF16 from the official tag.
#
# Unlike the latest Stockfish builder, this only builds once since SF16 is
# a fixed version. The binary is cached by architecture only.
#
# Environment Variables:
#   STOCKFISH16_VOLUME  - Path to store built binary (default: /stockfish16-bin)
#
# Binary Naming: stockfish16-{ARCH}
# A symlink 'stockfish16' points to the binary
# =============================================================================
set -e

VOLUME_PATH="${STOCKFISH16_VOLUME:-/stockfish16-bin}"
REPO_PATH="/tmp/stockfish16-src"

# =============================================================================
# Architecture Detection
# =============================================================================
detect_arch() {
    local machine
    machine=$(uname -m)

    case "$machine" in
        x86_64|amd64)
            # Check for BMI2 support
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
BINARY_NAME="stockfish16-${ARCH}"

echo "=== Stockfish 16 Builder ==="
echo "Detected architecture: $ARCH"
echo "Volume path: $VOLUME_PATH"
echo "Binary name: $BINARY_NAME"
echo ""

# =============================================================================
# Check Cache (SF16 is fixed version, no SHA needed)
# =============================================================================
if [ -f "$VOLUME_PATH/$BINARY_NAME" ]; then
    echo "Binary $BINARY_NAME already exists, skipping build"
    # Ensure symlink is correct
    ln -sf "$BINARY_NAME" "$VOLUME_PATH/stockfish16"
    echo "Symlink updated: stockfish16 -> $BINARY_NAME"
    exit 0
fi

# =============================================================================
# Clone Repository at sf_16 tag
# =============================================================================
echo "Cloning Stockfish at sf_16 tag..."
rm -rf "$REPO_PATH"
git clone --depth 1 --branch sf_16 \
    https://github.com/official-stockfish/Stockfish.git "$REPO_PATH"

# =============================================================================
# Build
# =============================================================================
echo "Building Stockfish 16 for $ARCH..."
cd "$REPO_PATH/src"
make clean
make -j"$(nproc)" build ARCH="$ARCH"

# =============================================================================
# Install
# =============================================================================
echo "Installing binary..."
cp stockfish "$VOLUME_PATH/$BINARY_NAME"
chmod +x "$VOLUME_PATH/$BINARY_NAME"
ln -sf "$BINARY_NAME" "$VOLUME_PATH/stockfish16"

echo ""
echo "=== Build Complete ==="
echo "Binary: $VOLUME_PATH/$BINARY_NAME"
echo "Symlink: $VOLUME_PATH/stockfish16 -> $BINARY_NAME"

# Verify
"$VOLUME_PATH/stockfish16" --version || echo "(version check not supported)"
