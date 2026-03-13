#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mkdir -p dist

echo "Building npdev binaries..."

bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/npdev-linux-x64
echo "  ✓ linux-x64"

bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/npdev-darwin-arm64
echo "  ✓ darwin-arm64"

bun build src/index.ts --compile --target=bun-darwin-x64 --outfile dist/npdev-darwin-x64
echo "  ✓ darwin-x64"

echo ""
echo "Binaries in dist/:"
ls -lh dist/npdev-*
