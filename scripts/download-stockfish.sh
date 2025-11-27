#!/bin/bash
#
# Download Stockfish binary for the current platform
# Supports macOS (Intel/ARM), Linux (x86_64/aarch64)
#

set -e

STOCKFISH_VERSION="17"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PROJECT_ROOT/bin"

# Colors (if terminal supports them)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  CYAN=''
  NC=''
fi

# Print with color
print_info() { echo -e "${CYAN}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }
print_error() { echo -e "${RED}$1${NC}"; }

# Detect OS and architecture
detect_platform() {
  local os=$(uname -s | tr '[:upper:]' '[:lower:]')
  local arch=$(uname -m)

  case "$os" in
    darwin)
      case "$arch" in
        arm64) echo "macos-m1-apple-silicon" ;;
        x86_64) echo "macos-x86-64-modern" ;;
        *) echo "unsupported"; return 1 ;;
      esac
      ;;
    linux)
      case "$arch" in
        x86_64) echo "ubuntu-x86-64-modern" ;;
        aarch64) echo "ubuntu-aarch64" ;;
        *) echo "unsupported"; return 1 ;;
      esac
      ;;
    *)
      echo "unsupported"
      return 1
      ;;
  esac
}

# Get download URL for platform
get_download_url() {
  local platform=$1
  local base_url="https://github.com/official-stockfish/Stockfish/releases/download"

  case "$platform" in
    macos-m1-apple-silicon)
      echo "${base_url}/sf_${STOCKFISH_VERSION}/stockfish-macos-m1-apple-silicon.tar"
      ;;
    macos-x86-64-modern)
      echo "${base_url}/sf_${STOCKFISH_VERSION}/stockfish-macos-x86-64-modern.tar"
      ;;
    ubuntu-x86-64-modern)
      echo "${base_url}/sf_${STOCKFISH_VERSION}/stockfish-ubuntu-x86-64-modern.tar"
      ;;
    ubuntu-aarch64)
      echo "${base_url}/sf_${STOCKFISH_VERSION}/stockfish-ubuntu-aarch64.tar"
      ;;
    *)
      echo ""
      return 1
      ;;
  esac
}

# Main download function
main() {
  echo ""
  print_info "Stockfish Downloader v${STOCKFISH_VERSION}"
  echo "========================================"
  echo ""

  # Detect platform
  local platform=$(detect_platform)
  if [[ "$platform" == "unsupported" ]]; then
    print_error "Error: Unsupported platform $(uname -s)/$(uname -m)"
    echo ""
    echo "Please download Stockfish manually from:"
    echo "  https://stockfishchess.org/download/"
    exit 1
  fi

  print_info "Detected platform: $platform"

  # Get download URL
  local url=$(get_download_url "$platform")
  if [[ -z "$url" ]]; then
    print_error "Error: Could not determine download URL"
    exit 1
  fi

  echo "Download URL: $url"
  echo ""

  # Check if already exists (could be file or directory from older extraction)
  local stockfish_target="$BIN_DIR/stockfish"
  if [[ -f "$stockfish_target" ]] || [[ -d "$stockfish_target" ]]; then
    print_warning "Stockfish already exists at $stockfish_target"
    read -p "Do you want to re-download and replace it? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Keeping existing installation."
      exit 0
    fi
    rm -rf "$stockfish_target"
  fi

  # Create bin directory
  mkdir -p "$BIN_DIR"

  # Download
  local tmp_file=$(mktemp)
  print_info "Downloading Stockfish..."

  if command -v curl &> /dev/null; then
    curl -L --progress-bar "$url" -o "$tmp_file"
  elif command -v wget &> /dev/null; then
    wget --show-progress -q "$url" -O "$tmp_file"
  else
    print_error "Error: Neither curl nor wget found"
    exit 1
  fi

  # Extract
  print_info "Extracting..."
  tar -xf "$tmp_file" -C "$BIN_DIR"
  rm "$tmp_file"

  # Find the extracted binary (it's in a subdirectory)
  local stockfish_binary=""

  # Try to find the binary in common locations
  if [[ -d "$BIN_DIR/stockfish" ]]; then
    # Binary is in a stockfish subdirectory
    stockfish_binary=$(find "$BIN_DIR/stockfish" -name "stockfish*" -type f 2>/dev/null | head -1)
  else
    # Binary might be directly in bin
    stockfish_binary=$(find "$BIN_DIR" -maxdepth 2 -name "stockfish*" -type f 2>/dev/null | head -1)
  fi

  if [[ -z "$stockfish_binary" ]]; then
    print_error "Error: Could not find extracted binary"
    echo "Contents of $BIN_DIR:"
    ls -la "$BIN_DIR"
    exit 1
  fi

  # Make executable
  chmod +x "$stockfish_binary"

  # Move or link to bin/stockfish if it's in a subdirectory
  if [[ "$stockfish_binary" != "$BIN_DIR/stockfish" ]]; then
    # If there's a subdirectory, move binary up and clean up
    mv "$stockfish_binary" "$BIN_DIR/stockfish"
    # Clean up the extracted directory structure
    for dir in "$BIN_DIR"/stockfish-*/; do
      if [[ -d "$dir" ]]; then
        rm -rf "$dir"
      fi
    done
  fi

  # Verify installation
  if [[ -f "$BIN_DIR/stockfish" && -x "$BIN_DIR/stockfish" ]]; then
    echo ""
    print_success "Stockfish installed successfully!"
    echo ""
    echo "Binary location: $BIN_DIR/stockfish"
    echo ""
    echo "To use with ChessBeast, either:"
    echo "  1. Add $BIN_DIR to your PATH:"
    echo "     export PATH=\"\$PATH:$BIN_DIR\""
    echo ""
    echo "  2. Or set STOCKFISH_PATH environment variable:"
    echo "     export STOCKFISH_PATH=\"$BIN_DIR/stockfish\""
    echo ""

    # Test the binary
    print_info "Testing installation..."
    if "$BIN_DIR/stockfish" quit <<< "quit" &> /dev/null; then
      print_success "Stockfish is working correctly!"
    else
      print_warning "Stockfish installed but could not be verified."
    fi
  else
    print_error "Error: Installation failed"
    exit 1
  fi
}

# Version check option
if [[ "$1" == "--version" || "$1" == "-v" ]]; then
  echo "Stockfish Downloader - targets Stockfish v${STOCKFISH_VERSION}"
  exit 0
fi

# Help option
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  echo "Usage: download-stockfish.sh [OPTIONS]"
  echo ""
  echo "Download and install Stockfish chess engine binary."
  echo ""
  echo "Options:"
  echo "  -v, --version    Show target Stockfish version"
  echo "  -h, --help       Show this help message"
  echo ""
  echo "Supported platforms:"
  echo "  - macOS (Intel x86_64 and Apple Silicon ARM64)"
  echo "  - Linux (x86_64 and aarch64)"
  echo ""
  echo "The binary will be installed to: $(dirname "$0")/../bin/stockfish"
  echo ""
  exit 0
fi

main
