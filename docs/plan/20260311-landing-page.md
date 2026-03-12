# ランディングページ（技術ブログ）実装計画

更新日: 2026-03-11


## 概要

Zenn のような技術ブログサイトをランディングページとして追加する。\
`docs/articles/` 内の Markdown ファイルから Next.js (App Router + SSG) で静的サイトを生成する。


## フェーズ構成

| フェーズ | 目的 | スコープ |
| --- | --- | --- |
| Phase 1 | 記事を公開し、読めるようにする | 一覧・詳細・Markdown レンダリング・SSG |
| Phase 2 | 記事を見つけやすくする | タグフィルタ・検索・関連記事・RSS |
| Phase 3 | 読者の反応を得る | いいね・シェア・コメント |


## Phase 1: MVP — 必要機能一覧


### コンテンツ表示

- 記事一覧ページ（カード形式: サムネイル・タイトル・日付・タグ表示）
- 記事詳細ページ（Markdown レンダリング、目次、読了時間の表示）
- ページネーション


### 記事メタ情報

- 著者名（Claude Code バージョン付き）
- 編集・監修者名
- 公開日・更新日の表示
- タグ/トピック
- AI 生成記事のバッジ表示


### Markdown 対応

- コードブロックのシンタックスハイライト
- Mermaid 図のレンダリング
- 画像・SVG（base64 データ URI 含む）の表示
- 目次（TOC）の自動生成


### デザイン/UX

- レスポンシブデザイン（モバイル・タブレット・デスクトップ）
- ダークモード対応
- OGP（Open Graph Protocol）メタタグ生成


### 静的サイト生成

- `docs/articles/` 内の Markdown ファイルからページを自動生成
- フロントマターからメタ情報を抽出（タイトル、日付、タグ、著者等）
- ビルド時に静的 HTML を生成（SSG）


## Phase 2: 発見性・回遊性

- タグによるフィルタリング
- キーワード検索（タイトル・本文）
- 関連記事の推薦
- パンくずリスト
- RSS フィード生成


## Phase 3: エンゲージメント

- いいね/ブックマーク（ローカルストレージ）
- SNS シェアボタン
- コメント機能（giscus 等の外部サービス連携）


## 技術スタック

| カテゴリ | 技術 | 選択理由 |
| --- | --- | --- |
| フレームワーク | Next.js (App Router) | SSG 対応、ユーザー指定 |
| Markdown 処理 | unified + remark + rehype | プラグインエコシステムが豊富 |
| シンタックスハイライト | rehype-pretty-code (Shiki) | テーマ対応、言語カバレッジが広い |
| Mermaid | rehype-mermaid | ビルド時 SVG 変換で JS 不要 |
| スタイル | MUI | 既存プロジェクトとの統一 |
| OGP 画像 | next/og (Satori) | ビルド時に自動生成 |


## ディレクトリ構成

```
packages/
  landing/
    src/
      app/
        page.tsx                    # トップ（記事一覧）
        articles/[slug]/
          page.tsx                  # 記事詳細
        layout.tsx                  # 共通レイアウト
      components/
        ArticleCard.tsx             # 記事カード
        ArticleList.tsx             # 記事一覧グリッド
        TableOfContents.tsx         # 目次
        AuthorInfo.tsx              # 著者情報
        AiBadge.tsx                 # AI 生成バッジ
      lib/
        markdown.ts                 # Markdown → HTML 変換パイプライン
        articles.ts                 # docs/articles/ の読み込み・解析
        frontmatter.ts              # フロントマター解析
      styles/
    next.config.ts
    package.json
```


## フロントマター仕様

記事の Markdown ファイルは以下のフロントマターを持つ。

```yaml
---
title: "記事タイトル"
date: "2026-03-11"
updated: "2026-03-11"
author: "Claude Code v2.1.71 (claude-opus-4-6)"
editor: "Kiyotaka Ueda"
tags: ["claude-code", "memory", "architecture"]
description: "記事の要約（OGP 用、120 文字以内）"
ai_generated: true
skills: ["tech-article", "markdown-output"]
---
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `title` | はい | 記事タイトル |
| `date` | はい | 公開日（YYYY-MM-DD） |
| `updated` | いいえ | 更新日（YYYY-MM-DD） |
| `author` | はい | 著者（ツール名・バージョン含む） |
| `editor` | いいえ | 編集・監修者名 |
| `tags` | いいえ | タグの配列 |
| `description` | いいえ | OGP 用の要約 |
| `ai_generated` | いいえ | AI 生成フラグ（デフォルト: false） |
| `skills` | いいえ | 利用スキル名の配列 |


## 実装タスク（Phase 1）

- [ ] モノレポに `packages/landing` を追加し、Next.js プロジェクトを初期化する
- [ ] `docs/articles/` の Markdown 読み込み・フロントマター解析ライブラリを実装する
- [ ] Markdown → HTML 変換パイプラインを構築する（remark / rehype / Shiki / Mermaid）
- [ ] 記事一覧ページ（`/`）を実装する
- [ ] 記事詳細ページ（`/articles/[slug]`）を実装する
- [ ] 目次コンポーネントを実装する
- [ ] 著者情報・AI 生成バッジコンポーネントを実装する
- [ ] レスポンシブ対応・ダークモード対応する
- [ ] OGP メタタグを設定する
- [ ] SSG ビルドを検証する
