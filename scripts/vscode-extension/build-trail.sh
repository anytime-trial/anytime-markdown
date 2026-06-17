#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$REPO_ROOT/scripts/vscode-extension/dist"
EXT_DIR="$REPO_ROOT/packages/vscode-trail-extension"

mkdir -p "$DIST_DIR"

echo "=== Anytime Trail: Build & Install ==="

cd "$REPO_ROOT"
npm install --ignore-scripts 2>/dev/null || npm install

echo "Building workspace dependencies..."
node "$REPO_ROOT/scripts/vscode-extension/_build-workspace-deps.mjs" "$EXT_DIR"
echo "Generating third-party notices..."
node "$REPO_ROOT/scripts/generate-third-party-notices.mjs" "$EXT_DIR" "$EXT_DIR/THIRD-PARTY-NOTICES.md"

echo "Building..."
cd "$EXT_DIR"
# Node24 + WSL では webpack production の terser ミニファイ中に V8 codegen が
# 非決定的に SIGSEGV(exit 139) する既知事象がある (重量バンドル trail-daemon.js /
# analyze-child.js で発生しやすい)。crash はランダムで再実行すれば通るため、
# 最大 PACKAGE_MAX_ATTEMPTS 回までリトライする。
PACKAGE_MAX_ATTEMPTS="${PACKAGE_MAX_ATTEMPTS:-3}"
attempt=1
until npm run package; do
  status=$?
  if [ "$attempt" -ge "$PACKAGE_MAX_ATTEMPTS" ]; then
    echo "ERROR: 'npm run package' が ${PACKAGE_MAX_ATTEMPTS} 回失敗しました (最後の exit code: ${status})。" >&2
    exit "$status"
  fi
  echo "WARN: 'npm run package' が exit ${status} で失敗。リトライ ${attempt}/${PACKAGE_MAX_ATTEMPTS}..." >&2
  attempt=$((attempt + 1))
done

echo "Packaging vsix..."
npx vsce package --no-dependencies -o "$DIST_DIR/anytime-trail.vsix"

echo "Installing..."
bash "$REPO_ROOT/scripts/vscode-extension/_install-vsix.sh" "$DIST_DIR/anytime-trail.vsix"

echo "Done! Restart VS Code to activate."
