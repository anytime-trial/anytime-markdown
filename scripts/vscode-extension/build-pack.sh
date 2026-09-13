#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$REPO_ROOT/scripts/vscode-extension/dist"
EXT_DIR="$REPO_ROOT/packages/vscode-extension-pack"

mkdir -p "$DIST_DIR"

echo "=== Anytime Extension Pack: Package & Install ==="

echo "Packaging vsix..."
cd "$EXT_DIR"
npx "${VSCE_SPEC:-@vscode/vsce@3.9.2}" package --no-dependencies -o "$DIST_DIR/anytime-extension-pack.vsix"

echo "Installing..."
bash "$REPO_ROOT/scripts/vscode-extension/_install-vsix.sh" "$DIST_DIR/anytime-extension-pack.vsix"

echo "Done! Restart VS Code to activate."
