#!/bin/bash
#
# Download Lichess Elite database (games from 2200+ rated players)
# Source: https://database.lichess.org/
#
# Note: This downloads a large file (~2GB compressed, ~8GB uncompressed)
# For development, consider using a smaller sample.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"

# Latest available Lichess Elite database (update URL as needed)
# These are typically monthly releases
ELITE_URL="https://database.lichess.org/lichess_elite_2024-12.pgn.zst"
ELITE_FILE="$DATA_DIR/lichess-elite.pgn"
ELITE_COMPRESSED="$DATA_DIR/lichess-elite.pgn.zst"

echo "Lichess Elite Database Downloader"
echo "================================="
echo ""
echo "WARNING: This downloads a large file (~2GB compressed, ~8GB uncompressed)"
echo "For development, you may want to use a smaller sample."
echo ""

# Check for required tools
if ! command -v curl &> /dev/null; then
  echo "Error: curl is required but not installed."
  exit 1
fi

if ! command -v zstd &> /dev/null; then
  echo "Error: zstd is required for decompression."
  echo "Install with: brew install zstd"
  exit 1
fi

# Create data directory
mkdir -p "$DATA_DIR"

# Check if already downloaded
if [ -f "$ELITE_FILE" ]; then
  echo "Lichess Elite PGN already exists at: $ELITE_FILE"
  echo "Delete it first if you want to re-download."
  exit 0
fi

echo "Downloading from: $ELITE_URL"
echo "This may take a while..."
echo ""

# Download
curl -L "$ELITE_URL" -o "$ELITE_COMPRESSED" --progress-bar

echo ""
echo "Decompressing..."
zstd -d "$ELITE_COMPRESSED" -o "$ELITE_FILE"

# Clean up compressed file
rm -f "$ELITE_COMPRESSED"

echo ""
echo "Lichess Elite data downloaded successfully!"
echo "File: $ELITE_FILE"
echo ""
echo "To build the database, run:"
echo "  pnpm run build"
echo "  node packages/database/dist/loaders/lichess-loader.js"
echo ""
echo "For a smaller subset during development, use:"
echo "  node packages/database/dist/loaders/lichess-loader.js 10000"
