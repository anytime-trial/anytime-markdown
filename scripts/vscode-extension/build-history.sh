#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$REPO_ROOT/scripts/vscode-extension/dist"
EXT_DIR="$REPO_ROOT/packages/vscode-history-extension"

mkdir -p "$DIST_DIR"

echo "=== Anytime History: Build & Install ==="

cd "$REPO_ROOT"
npm install --ignore-scripts 2>/dev/null || npm install

echo "Building workspace dependencies..."
node "$REPO_ROOT/scripts/vscode-extension/_build-workspace-deps.mjs" "$EXT_DIR"
echo "Generating third-party notices..."
node "$REPO_ROOT/scripts/generate-third-party-notices.mjs" "$EXT_DIR" "$EXT_DIR/THIRD-PARTY-NOTICES.md"

echo "Building..."
cd "$EXT_DIR"
npm run package

echo "Packaging vsix..."
npx vsce package --no-dependencies -o "$DIST_DIR/anytime-history.vsix"

echo "Installing..."
bash "$REPO_ROOT/scripts/vscode-extension/_install-vsix.sh" "$DIST_DIR/anytime-history.vsix"

echo "Done! Restart VS Code to activate."
