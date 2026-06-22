---
name: anytime-markdown-mcp-tactics
description: anytime-markdown の Markdown ドキュメントを検索・調査・編集・整形する時、特にトークン（cache_read 加重）を抑えたい時に使用する。mcp-markdown の search_docs/search_sections/grep_markdown/get_outline/get_section/update_section/get_frontmatter/update_frontmatter/format_markdown/compute_diff を使う時、検索・調査をサブエージェントへ委譲する時の運用手順と委任プロンプト雛形。
---

# Markdown 検索・編集のトークン削減タクティクス

更新日: 2026-06-21

原則: 加重コストの本丸は「文脈サイズ × 再読込（cache_read）」。**Markdown 本文をメイン文脈に載せない**ことが削減の核心。
mcp-markdown ツールはそれを実現する手段（[[markdown-ext-doc-core-pipeline]] / [[markdown-ext-bundle-mcp-markdown]]）。

## A. 検索・編集の使い分け（目的 → ツール）

| 目的 | 使うツール | 避ける（高コスト） |
|---|---|---|
| どのファイルか特定 | `search_docs`（path/title/**excerpt/snippet** を返す＝開かず判断） | Grep で複数ファイルを開く |
| 節単位で検索 | `search_sections`（見出し＋snippet・search_docs→outline→section を1コールに圧縮） | 全文 Read |
| ファイル内を文字列検索 | `grep_markdown`（行番号＋囲み見出し＋snippet・search_docs の文書内版） | 全文 Read して目視 |
| 関係をたどる | `doc_backlinks` / `doc_neighbors` | 多数の frontmatter を Read |
| ファイル内の場所把握 | `get_outline`（見出し+行番号のみ） | 全文 Read |
| 必要な節だけ取得 | `get_section`（`maxChars` で上限） | 全文 Read |
| frontmatter の取得・更新 | `get_frontmatter` / `update_frontmatter`（本文を読まず） | 全文 Read＋Edit |
| 節を書き換え | `update_section`（見出し＋新内容のみ） | Read＋Edit（全文＋old_string 再現＝二重コスト） |
| 規約準拠の整形 | `format_markdown`（mode fix/check・**差分サマリのみ返す**＝本文を載せない） | 本文を往復させて手で整形 |
| HTML 無害化・tiptap 往復正規化 | `sanitize_markdown`（**整形目的では使わない**） | — |
| 変更検証 | `compute_diff` | 両ファイル再 Read |

> `format_markdown` と `sanitize_markdown` は別物。**整形（anytime-markdown-check 規約準拠）は `format_markdown`**。`sanitize_markdown` は DOMPurify による HTML 無害化＋tiptap ラウンドトリップ用マーカー付与で、整形目的に使うと ZWSP/ZWNJ・ハードブレークを注入してしまう。

黄金ルート: **検索** `search_docs`/`search_sections`→snippet で選別→`get_outline`→`get_section`。**編集** `get_section`→修正→`update_section`→`compute_diff`。**整形** `format_markdown(path, mode="fix")`（ルート外は不可）。

## 注意（実装仕様）

- `doc_fts` は **trigram**。検索語・snippet は **3文字以上**でないと一致しない（2字語は 0 件）。
- `search_docs` の既定 `limit` は **8**、`snippetTokens` 既定 24（trigram トークン≒文字数・最大 64）。多すぎる limit は逆にトークン増。
- `get_section` は `maxChars` で巨大節を切詰め（`…(truncated)`）。
- 検索系は `<workspace>/.anytime/markdown/doc-core.db` を readonly 参照。**未構築なら明示エラー**→拡張コマンド「Rebuild Doc Search Index」で ingest 後に使う。

## C. サブエージェントへの委譲（検索・調査）

検索・トリアージ・ログ解析は Haiku サブエージェントへ委譲し、メイン（Opus）文脈を保護する。
**サブエージェントは CLAUDE.md を継承しない**ため、本文を返さないルールは委任プロンプトに必ず明記する。

委任プロンプト雛形:

```
対象: <調査テーマ>。anytime-markdown のドキュメント検索。
ツール: mcp-markdown の search_docs（query/category/type/lang）・doc_backlinks・doc_neighbors・get_outline・get_section を使う。
手順: search_docs の excerpt/snippet で候補を選別 → 必要時のみ get_section で該当節だけ読む。
出力（厳守）: 結論＋関連 path の一覧＋（あれば）該当見出しと1〜2行要約のみ。
**Markdown 本文の貼り付け禁止**。全文 Read 禁止（get_outline→get_section で必要箇所のみ）。
model: haiku
```

## よくある失敗

- snippet を使わず全 Read → snippet 分だけ増えて逆効果。**limit 小・snippet で選別**してから開く。
- `update_section` の content に見出し行を含め忘れ → 見出しごと消える。見出し行を必ず含める。
- 2文字キーワードで 0 件 → trigram 制約。3文字以上に。
