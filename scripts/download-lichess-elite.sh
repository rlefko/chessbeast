#!/bin/bash
#
# Download Lichess Elite database (games from 2400+ rated players)
# Source: https://database.nikonoel.fr/ (third-party maintained)
#
# Note: This downloads a single month of games (~50-100MB compressed)
# For the full database, visit the website directly.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"

# Use a recent stable month from database.nikonoel.fr
# The site provides monthly zip files containing PGN games
ELITE_MONTH="2025-08"
ELITE_URL="https://database.nikonoel.fr/lichess_elite_${ELITE_MONTH}.zip"
ELITE_FILE="$DATA_DIR/lichess-elite.pgn"
ELITE_COMPRESSED="$DATA_DIR/lichess-elite.zip"

echo "Lichess Elite Database Downloader"
echo "================================="
echo ""
echo "Source: database.nikonoel.fr (Lichess Elite Database)"
echo "Month: $ELITE_MONTH"
echo ""

# Check for required tools
if ! command -v curl &> /dev/null; then
  echo "Error: curl is required but not installed."
  exit 1
fi

if ! command -v unzip &> /dev/null; then
  echo "Error: unzip is required for decompression."
  echo "Install with: brew install unzip (macOS) or apt install unzip (Linux)"
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
echo "This may take a few minutes..."
echo ""

# Download with -f flag to fail on HTTP errors (404, etc.)
if ! curl -fL "$ELITE_URL" -o "$ELITE_COMPRESSED" --progress-bar; then
  echo ""
  echo "Error: Download failed. The URL may be outdated."
  echo "Please check https://database.nikonoel.fr/ for available months"
  echo "and update ELITE_MONTH in this script."
  rm -f "$ELITE_COMPRESSED"
  exit 1
fi

echo ""
echo "Decompressing..."

# Extract PGN from zip - the zip contains a single .pgn file
# Use unzip -p to extract to stdout, then redirect to our target file
unzip -p "$ELITE_COMPRESSED" "*.pgn" > "$ELITE_FILE"

# Clean up compressed file
rm -f "$ELITE_COMPRESSED"

echo ""
echo "Lichess Elite data downloaded successfully!"
echo "File: $ELITE_FILE"
echo "Size: $(du -h "$ELITE_FILE" | cut -f1)"
echo ""
echo "To build the database, run:"
echo "  make build-db"
echo ""
echo "For a smaller subset during development, use:"
echo "  node packages/database/dist/loaders/lichess-loader.js 10000"
echo ""
