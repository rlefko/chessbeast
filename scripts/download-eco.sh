#!/bin/bash
#
# Download ECO opening data from Lichess chess-openings repository
# Source: https://github.com/lichess-org/chess-openings
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
ECO_DIR="$DATA_DIR/eco-source"

REPO_URL="https://raw.githubusercontent.com/lichess-org/chess-openings/master/dist"

echo "Downloading ECO opening data..."
echo "Target directory: $ECO_DIR"

# Create directory if it doesn't exist
mkdir -p "$ECO_DIR"

# Download each letter file
for letter in a b c d e; do
  echo "  Downloading ${letter}.tsv..."
  curl -sL "${REPO_URL}/${letter}.tsv" -o "${ECO_DIR}/${letter}.tsv"
done

echo "ECO data downloaded successfully!"
echo ""
echo "To build the database, run:"
echo "  pnpm run build"
echo "  node packages/database/dist/loaders/eco-loader.js"
