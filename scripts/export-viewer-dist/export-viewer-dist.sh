#!/usr/bin/env bash
#
# export-viewer-dist.sh — export-viewer-dist.mjs の sh ラッパ。
# node を明示せずシェルから直接叩けるようにするだけで、ロジックは持たない。
#
# 使い方: scripts/export-viewer-dist/export-viewer-dist.sh --out <dir> [--package <name>]
#   （sh scripts/export-viewer-dist/export-viewer-dist.sh ... でも可。引数はそのまま .mjs へ渡す）
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/export-viewer-dist.mjs" "$@"
