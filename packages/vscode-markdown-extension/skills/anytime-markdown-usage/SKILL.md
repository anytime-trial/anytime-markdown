---
name: anytime-markdown-usage
effort: low
description: anytime-markdown の Markdown ドキュメントを検索・調査・編集・整形する時、設計書（<docsRoot>/spec）を辿る・参照する・「どの spec を読むべきか」を判断する時、特にトークン（cache_read 加重）を抑えたい時に使用する。mcp-markdown の search_docs/search_sections/get_outline/get_section/update_section/get_frontmatter/update_frontmatter/format_markdown/doc_backlinks/doc_neighbors を使う時、索引(index.ja.md) → 対象 frontmatter → 型付き related を必要な深さだけ辿る progressive disclosure で設計書を調査・参照・関連ドキュメント探索する時、検索・調査をサブエージェントへ委譲する時の運用手順と委任プロンプト雛形。
---

# Markdown 利用ガイド（検索・編集・設計書ナビのトークン削減）

更新日: 2026-08-22（旧 `anytime-spec-lookup`（設計書ナビゲーション）を §D へ統合。どちらも「Markdown をメイン文脈に載せない」同一原則の適用のため）

原則: 加重コストの本丸は「文脈サイズ × 再読込（cache_read）」。**Markdown 本文をメイン文脈に載せない**ことが削減の核心。
mcp-markdown ツールはそれを実現する手段（[[markdown-ext-markdown-catalog-pipeline]] / [[markdown-ext-bundle-mcp-markdown]]）。

## A. 検索・編集の使い分け（目的 → ツール）

| 目的 | 使うツール | 避ける（高コスト） |
|---|---|---|
| どのファイルか特定 | `search_docs`（path/title/**excerpt/snippet** を返す＝開かず判断） | Grep で複数ファイルを開く |
| 節単位で検索 | `search_sections`（見出し＋snippet・search_docs→outline→section を1コールに圧縮） | 全文 Read |
| ファイル内を文字列検索 | 組み込み Grep（`path` で単一ファイルへ絞る） | 全文 Read して目視 |
| 関係をたどる | `doc_backlinks` / `doc_neighbors` | 多数の frontmatter を Read |
| ファイル内の場所把握 | `get_outline`（見出し+行番号のみ） | 全文 Read |
| 必要な節だけ取得 | `get_section`（`maxChars` で上限） | 全文 Read |
| frontmatter の取得・更新 | `get_frontmatter` / `update_frontmatter`（本文を読まず） | 全文 Read＋Edit |
| 節を書き換え | `update_section`（見出し＋新内容のみ） | Read＋Edit（全文＋old_string 再現＝二重コスト） |
| 規約準拠の整形 | `format_markdown`（mode fix/check・**差分サマリのみ返す**＝本文を載せない） | 本文を往復させて手で整形 |
| 変更検証 | `update_section` / `update_frontmatter` の**返却サマリ**（追加コール不要）。独立比較は `git diff` / `diff` | 両ファイル再 Read |
| 新規作成・全面書き換え | 組み込み Write（**このケースのみ**） | 部分編集目的の全文 Read→Write 往復（最高コスト経路。部分編集は必ず `update_section` / `update_frontmatter`） |

黄金ルート: **検索** `search_docs`/`search_sections`→snippet で選別→`get_outline`→`get_section`。**編集** `get_section`→修正→`update_section`（返却の差分サマリ `oldLines/newLines/bytesDelta/warnings` で検証）。**整形** `format_markdown(path, mode="fix")`（ルート外は不可）。

## B. 注意（実装仕様）

- `doc_fts` は **trigram**。検索語・snippet は **3文字以上**でないと一致しない（2字語は 0 件）。
- `search_docs` の既定 `limit` は **8**、`snippetTokens` 既定 24（trigram トークン≒文字数・最大 64）。多すぎる limit は逆にトークン増。`search_sections` は `query` **必須**（facet のみの節検索は不可。facet だけなら `search_docs`）。
- `get_section` は `maxChars` で巨大節を切詰め（`…(truncated)`）。
- **重複見出し**: `get_section` / `update_section` は同一 level＋text の見出しが複数あると**曖昧エラー**（行番号一覧つき）。`occurrence: n`（1-based）で指名する。
- `update_section` / `update_frontmatter` は**実施サマリを返す**（前者: `oldLines/newLines/bytesDelta/warnings`、後者: `setKeys/removedKeys/createdFrontmatter`）。`warnings` に「content が見出し行で始まらない」等が出たら意図どおりか確認する。
- `doc_backlinks` の `type` フィルタは `references` / `depends-on` / `implements` / `part-of` / `supersedes` / `refines` の 6 値（§D の related 型と同語彙）。
- 検索系は `<workspace>/.anytime/markdown/catalog.db` を readonly 参照。**未構築なら明示エラー**→拡張コマンド「Rebuild Doc Search Index」で ingest 後に使う（それまでの fallback は §D の Grep → 先頭 limit Read）。

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
```

> モデル指定は Agent ツールの **`model` パラメータ**（`model: "haiku"`）で行う。プロンプト本文に書いても効かない。

## D. 設計書ナビゲーション（spec を progressive disclosure で辿る）

設計書（`<docsRoot>/spec`・約 170 ファイル / 42k 行）を**全 Read せず**、索引と frontmatter の型付き関係で必要箇所だけ辿る（旧 `anytime-spec-lookup`）。

### 前提: 関係は frontmatter が単一ソース

各 spec の frontmatter `related` が型付きの関係を持つ（語彙は `spec/33.graph/03.graph-viewer/note-relations.ja.md`）。

```yaml
related:
  - to: "spec/41.trail-activity/trail-activity.ja.md"
    type: depends-on
  - "spec/42.trail-caravan-book/trail-caravan-book.ja.md"   # 素の文字列 = references
```

型: `references`（弱い参照・既定） / `depends-on` / `implements` / `part-of` / `supersedes` / `refines`。
人はノート網 UI（markdown エディタ右パネル）で、Claude は frontmatter テキスト（または `doc_neighbors` / `doc_backlinks`）で同じ関係を読む。

### 手順

1. **索引・検索から入る**: `search_docs`（category/type/lang facet 可）の excerpt/snippet で当たりを付ける。catalog.db 未構築時は `spec/index.ja.md` を Grep（タイトル・category・excerpt）。索引を全 Read しない（索引は `scripts/gen-spec-index.mjs` による生成物）。
2. **対象の frontmatter だけ読む**: 候補は `get_frontmatter` で `title` / `excerpt` / `related` を確認する（fallback: `Read` の `limit` で先頭 frontmatter 〜20 行のみ）。本文が必要と判断してから `get_outline` → `get_section` で該当節だけ読む。
3. **型に応じて辿る**:
   - `depends-on` / `implements`: 前提・実装先へ。仕様の根拠を辿るときに優先。
   - `part-of`: 親ドキュメントへ。全体像が要るとき。
   - `supersedes`: **新 → 旧**。`supersedes` 先（旧）は歴史的経緯。最新仕様は supersedes 元（新）を読む。
   - `refines`: 詳細化/派生。粒度を下げるとき。
   - `references`: 弱い参照。関連はするが依存ではない。深追いしない。
4. **逆方向（バックリンク）**: frontmatter は片方向。「この spec を前提にしているのは誰か」は `doc_backlinks`（`type` フィルタ可）で逆引きする（fallback: `related` の `to` にそのパスを持つファイルを Grep）。
5. **必要な深さで止める**: 1〜2 ホップで十分なことが多い。全 related を機械的に辿らない。

### やってはいけないこと

- `spec/` 配下の全ファイル一括 Read / ディレクトリ丸ごと取得（文脈肥大の主因）。
- 索引や本文を「念のため」全文読み込む。search_docs / Grep → `get_section`（または offset/limit Read）に徹する。
- frontmatter ではなく本文リンクだけで関係を推測する（型情報を失う）。

### 索引の再生成

索引は生成物のため手で編集しない。再生成コマンド・運用（type 別 `npm run spec:index` 等・再生成必須の条件)は `anytime-doc-authoring` スキル §1.2 に集約した（書き手側の運用。本節は読み手側ナビに徹する）。

## よくある失敗

- snippet を使わず全 Read → snippet 分だけ増えて逆効果。**limit 小・snippet で選別**してから開く。
- `update_section` の content に見出し行を含め忘れ → 見出しごと消える。見出し行を必ず含める（返却サマリの `warnings` が検知するので必ず確認）。
- 同名見出し（「### 例」等の反復）への編集 → 曖昧エラーになる。`get_outline` で行番号を確認し `occurrence` で指名する。
- **新しい節の追加**は `update_section` ではできない（既存節の置換のみ）。直前の既存節を `get_section` で取り、新節を末尾に連結して `update_section` する（親節ごとの書き換えは不可避に大きいので、隣接する**最小の節**を選ぶ）。ファイルが小さい（目安 200 行未満）場合のみ組み込み Write での全文置換も許容。
- 2文字キーワードで 0 件 → trigram 制約。3文字以上に。
