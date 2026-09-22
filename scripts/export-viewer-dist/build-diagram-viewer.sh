#!/usr/bin/env bash
#
# build-diagram-viewer.sh — diagram-viewer の配布バンドル（Custom Element
# `<anytime-diagram-viewer>`）を本スクリプトと同じフォルダへ書き出す。
# export-viewer-dist.mjs の出力先を自フォルダに固定するだけで、ロジックは持たない。
#
# packages/diagram-viewer/dist は .gitignore の `dist` に該当し、git status にも
# VS Code のソース管理ビューにも現れない。受け渡し用の成果物を、置き場所の決まった
# 1 か所へ出すのが目的。
#
# 出力先（本スクリプトと同じフォルダの diagram-viewer/）自体も .gitignore 済みで、
# バンドルはコミットしない。**由来は併置される manifest.json が唯一の記録**で、
# version・commit・dirty・sha256 を持つ。渡す前に `dirty` が false であることを
# 確認すること（true は再現できないワークツリーから作った印で、後から「入っている版が
# どのコミットのものか」を決められなくなる）。
#
# 渡す相手は別リポジトリ anytime-travel。受け側の手順は
# <docsRoot>/spec/37.diagram/diagram-viewer-web-component.ja.md の §6 を参照する。
#
# 使い方:
#   scripts/export-viewer-dist/build-diagram-viewer.sh
#   scripts/export-viewer-dist/build-diagram-viewer.sh --package cooccurrence-viewer  # 対象を追加
#
# 出力: 本スクリプトと同じフォルダの <パッケージ名>/ 配下（.js と manifest.json）。
#   追加引数はそのまま export-viewer-dist.mjs へ渡す。`--package` を足すと対象が
#   diagram-viewer に追加される（置き換えではない）。`--out` を後置すれば出力先を
#   差し替えられる（同名オプションは後勝ち）。
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/export-viewer-dist.mjs" \
  --out "$script_dir" \
  --package diagram-viewer \
  "$@"
