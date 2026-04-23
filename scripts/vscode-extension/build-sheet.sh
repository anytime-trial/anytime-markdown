#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$REPO_ROOT/scripts/vscode-extension/dist"
EXT_DIR="$REPO_ROOT/packages/vscode-sheet-extension"

mkdir -p "$DIST_DIR"

echo "=== Anytime Sheet: Build & Install ==="

cd "$REPO_ROOT"
npm install --ignore-scripts 2>/dev/null || npm install

echo "Building..."
cd "$EXT_DIR"
npm run package

echo "Packaging vsix..."
npx vsce package --no-dependencies -o "$DIST_DIR/anytime-sheet.vsix"

echo "Installing..."
code --install-extension "$DIST_DIR/anytime-sheet.vsix" --force

echo "Done! Restart VS Code to activate."
