# @anytime-markdown/markdown-view-lite

Readonly markdown viewer Web Component (lean). 図表（mermaid/katex/plantuml 等）の描画は
含まず、コードブロックは素のフェンス表示になる。図表が必要な場合は
`@anytime-markdown/markdown-view`（figure 同梱版）を使う。両者は同一タグ `<anytime-markdown-view>` を登録する。

## バンドラ利用（ESM）

import で要素が登録され、`<anytime-markdown-view>` の `value` プロパティに Markdown 文字列を渡す。

## script 単体利用（IIFE・自己完結）

`dist/markdown-view-lite.iife.js` を `<script>` で読み込むだけで動作する。
