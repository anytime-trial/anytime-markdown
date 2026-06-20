---
name: spec-lookup
effort: low
description: anytime-markdown の設計書（/Shared/anytime-markdown-docs/spec）を低トークンで辿るためのナビゲーション手順。索引(00-index.ja.md) → 対象 frontmatter → 型付き related を必要な深さだけ辿る progressive disclosure。設計書の調査・参照・関連ドキュメント探索・「どの spec を読むべきか」を判断する時に使用する。
---

# 設計書ナビゲーション（spec-lookup）

設計書（`/Shared/anytime-markdown-docs/spec`・約 170 ファイル / 58k 行）を**全 Read せず**、
索引と frontmatter の型付き関係を使って必要箇所だけ辿る手順。文脈肥大（`cache_read` 加重）を避ける。

## 前提: 関係は frontmatter が単一ソース

各 spec の frontmatter `related` が型付きの関係を持つ（語彙は `spec/54.graph-viewer/note-relations.ja.md`）。

```yaml
related:
  - to: "spec/41.trail-core/trail-core.ja.md"
    type: depends-on
  - "spec/42.memory-core/memory-core.ja.md"   # 素の文字列 = references
```

型: `references`（弱い参照・既定） / `depends-on` / `implements` / `part-of` / `supersedes` / `refines`。
人はノート網 UI（markdown エディタ右パネル）で、Claude は frontmatter テキストで同じ関係を読む。

## 手順（progressive disclosure）

1. **索引から入る**: まず `spec/00-index.ja.md` を Grep（タイトル・category・excerpt）で当たりを付ける。
   全 Read しない。索引は `scripts/gen-spec-index.mjs` が frontmatter から自動生成する。
2. **対象の frontmatter だけ読む**: 候補ファイルは `Read` の `limit` で**先頭 frontmatter（〜20 行）**のみ取得し、
   `title` / `excerpt` / `related` を確認する。本文が必要と判断してから本文を読む。
3. **型に応じて辿る**:
   - `depends-on` / `implements`: 前提・実装先へ。仕様の根拠を辿るときに優先。
   - `part-of`: 親ドキュメントへ。全体像が要るとき。
   - `supersedes`: **新 → 旧**。`supersedes` 先（旧）は歴史的経緯。最新仕様は supersedes 元（新）を読む。
   - `refines`: 詳細化/派生。粒度を下げるとき。
   - `references`: 弱い参照。関連はするが依存ではない。深追いしない。
4. **逆方向（バックリンク）**: frontmatter は片方向。「この spec を前提にしているのは誰か」は
   `related` の `to` にそのパスを持つファイルを Grep で逆引きする（または UI のバックリンク表示）。
5. **必要な深さで止める**: 1〜2 ホップで十分なことが多い。全 related を機械的に辿らない。

## やってはいけないこと

- `spec/` 配下の全ファイル一括 Read / ディレクトリ丸ごと取得（文脈肥大の主因）。
- 索引や本文を「念のため」全文読み込む。Grep → offset/limit Read に徹する。
- frontmatter ではなく本文リンクだけで関係を推測する（型情報を失う）。

## 索引の再生成

frontmatter を変更したら `npm run spec:index`（`node scripts/gen-spec-index.mjs [specDir] [outFile]`）で
`spec/00-index.ja.md` を再生成する。索引は生成物のため手で編集しない。
