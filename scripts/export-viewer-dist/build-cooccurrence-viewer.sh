#!/usr/bin/env bash
#
# build-cooccurrence-viewer.sh — cooccurrence-viewer の配布バンドルを本スクリプトと同じ
# フォルダへ書き出す。export-viewer-dist.mjs の出力先を自フォルダに固定するだけで、
# ロジックは持たない。
#
# packages/cooccurrence-viewer/dist は .gitignore の `dist` に該当し、git status にも
# VS Code のソース管理ビューにも現れない。受け渡し用の成果物を追跡可能な場所へ出すのが目的。
#
# 使い方:
#   scripts/export-viewer-dist/build-cooccurrence-viewer.sh
#   scripts/export-viewer-dist/build-cooccurrence-viewer.sh --package markdown-editor  # 対象を追加
#
# 出力: 本スクリプトと同じフォルダの <パッケージ名>/ 配下（.js と manifest.json）。
#   追加引数はそのまま export-viewer-dist.mjs へ渡す。`--package` を足すと対象が
#   cooccurrence-viewer に追加される（置き換えではない）。`--out` を後置すれば出力先を
#   差し替えられる（同名オプションは後勝ち）。
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/export-viewer-dist.mjs" \
  --out "$script_dir" \
  --package cooccurrence-viewer \
  "$@"
