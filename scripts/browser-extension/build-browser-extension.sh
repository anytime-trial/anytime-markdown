#!/usr/bin/env bash
set -euo pipefail

# Chrome / Edge (Manifest V3) 拡張 @anytime-markdown/browser-extension をビルドする。
# 拡張は markdown-rich → markdown-viewer のソースを esbuild で自己完結バンドルするため、
# VS Code 拡張の build-*.sh と異なり workspace 依存の事前ビルド (_build-workspace-deps.mjs) は
# 不要。出力は packages/browser-extension/dist/（未パッケージ拡張としてそのまま読み込む）。

# スクリプト自身のディレクトリを絶対パスで確定する。後段で `cd "$REPO_ROOT"` した後も
# 補助スクリプト（zip-dist.mjs）を正しく参照するため（相対 dirname "$0" は cd 後に壊れる）。
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXT_DIR="$REPO_ROOT/packages/browser-extension"
DIST_DIR="$EXT_DIR/dist"

echo "=== Anytime Markdown Browser Extension: Build ==="

# workspace の symlink と重量依存 (mermaid/katex/jsxgraph/plotly 等) を解決する。
# 既にインストール済みなら実質 no-op。
cd "$REPO_ROOT"
npm install --ignore-scripts 2>/dev/null || npm install

echo "Building (esbuild: code splitting + CSS/フォント抽出)..."
npm run build -w @anytime-markdown/browser-extension

# 配布用 zip。Chrome Web Store / Edge Add-ons へはこれを提出する。
# zip コマンドがあれば使い、無ければ Node + jszip にフォールバックする（WSL 等で zip 未搭載のため）。
ZIP_PATH="$EXT_DIR/browser-extension.zip"
rm -f "$ZIP_PATH"
if command -v zip >/dev/null 2>&1; then
  ( cd "$DIST_DIR" && zip -qr "$ZIP_PATH" . )
  echo "Packaged: $ZIP_PATH"
elif command -v node >/dev/null 2>&1; then
  node "$SCRIPT_DIR/zip-dist.mjs" "$DIST_DIR" "$ZIP_PATH"
else
  echo "WARN: zip も node も無いため zip を作成できません。手動でパックしてください。"
fi

echo ""
echo "Done. 出力: $DIST_DIR"
echo ""
echo "読み込み方法:"
echo "  Chrome: chrome://extensions → デベロッパーモード ON →"
echo "          「パッケージ化されていない拡張機能を読み込む」→ $DIST_DIR を選択"
echo "  Edge:   edge://extensions → 開発者モード ON →"
echo "          「展開して読み込み」→ $DIST_DIR を選択"
echo ""
echo "再ビルド後は chrome://extensions のリロード(↻) → エディタタブを開き直して反映。"
