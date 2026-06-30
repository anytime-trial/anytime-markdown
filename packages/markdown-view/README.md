# @anytime-markdown/markdown-view

Readonly markdown viewer Web Component（figure 同梱）。mermaid / katex / plantuml / math /
anytime-graph / anytime-chart を追加注入なしで描画する。テキスト中心で軽量にしたい場合は
`@anytime-markdown/markdown-view-lite` を使う。両者は同一タグ `<anytime-markdown-view>` を登録する。

## 利用（バンドラ必須・ESM）

import で要素が登録される。図表ライブラリ（mermaid/katex 等）は本パッケージの依存として自動導入され、
katex の CSS/フォントは提供先 bundler が解決する。`<script>` 単体（IIFE）配布は katex フォント参照のため提供しない。
