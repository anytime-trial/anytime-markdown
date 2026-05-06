#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$REPO_ROOT/scripts/vscode-extension/dist"
EXT_DIR="$REPO_ROOT/packages/vscode-database-extension"

mkdir -p "$DIST_DIR"

echo "=== Anytime Database: Build & Install ==="

cd "$REPO_ROOT"
npm install --ignore-scripts 2>/dev/null || npm install

# VS Code Extension Host は Node 22 系で動作するため、ホスト Node のバージョン
# (24 等) 向け prebuild が node_modules に置かれている場合は VSIX で
# NODE_MODULE_VERSION 不一致エラーになる。VSCODE_NODE_TARGET (例: 22.20.0) を
# 指定して better-sqlite3 の prebuild を VS Code 用に置換する。
VSCODE_NODE_TARGET="${VSCODE_NODE_TARGET:-22.20.0}"
echo "Resolving better-sqlite3 prebuild for Node ${VSCODE_NODE_TARGET}..."
(
  cd "$REPO_ROOT/node_modules/better-sqlite3"
  npx prebuild-install --target="$VSCODE_NODE_TARGET" --runtime=node \
    --download-host=https://github.com/WiseLibs/better-sqlite3/releases/download \
    >/dev/null 2>&1 || {
      echo "WARNING: prebuild-install failed, current binary will be used as-is" >&2
    }
)

echo "Building..."
cd "$EXT_DIR"
# NOTE: webpack 完了後に Node 24 で稀に segfault (exit 139) を出すが、
# dist/extension.js / dist/webview.js が生成されていれば成果物は健全なので
# pipefail の影響を受けないよう一時的に -e を外し、成果物の存在で判定する。
set +e
npm run package
build_exit=$?
set -e
if [ ! -f "$EXT_DIR/dist/extension.js" ] || [ ! -f "$EXT_DIR/dist/webview.js" ]; then
  echo "Build failed (exit=$build_exit, artifacts missing)" >&2
  exit "$build_exit"
fi
if [ "$build_exit" -ne 0 ]; then
  echo "Build exited $build_exit but artifacts present, continuing..." >&2
fi

echo "Packaging vsix..."
# vsce は vscode:prepublish で webpack を再実行する。Node 24 segfault が再発した場合に
# 備えて、同様の成果物チェック付きでリトライ可能にする。
set +e
npx vsce package --no-dependencies -o "$DIST_DIR/anytime-database.vsix"
vsce_exit=$?
set -e
if [ ! -f "$DIST_DIR/anytime-database.vsix" ]; then
  echo "vsce failed (exit=$vsce_exit, vsix missing)" >&2
  exit "$vsce_exit"
fi
if [ "$vsce_exit" -ne 0 ]; then
  echo "vsce exited $vsce_exit but vsix present, continuing..." >&2
fi

echo "Installing..."
code --install-extension "$DIST_DIR/anytime-database.vsix" --force

echo "Done! Restart VS Code to activate."
