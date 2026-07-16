# 要件書テンプレート

Phase 1 のインタビュー回答を本テンプレートに埋め込み、Phase 2 で `writing-plans` に渡す。\
プレースホルダ `{{...}}` は Phase 1 完了時に置換される。


## 出力先

`<project-root>/requirements.md`


## テンプレート本体

```markdown
---
title: "{{Q1_PROJECT_PURPOSE}} 実装要件"
date: "{{TODAY_ISO_DATE}}"
type: "spec"
lang: "ja"
author: "anytime-build-webapp skill v1.0.0"
category: "skill-generated"
excerpt: "{{Q1_PROJECT_PURPOSE}} の MVP 実装要件（anytime-build-webapp スキル自動生成）。"
---


# {{Q1_PROJECT_PURPOSE}} 実装要件


## 1. プロジェクト概要

- **目的**: {{Q1_PROJECT_PURPOSE}}
- **生成元スキル**: `anytime-build-webapp` v1.0.0
- **生成日時**: {{TODAY_ISO_DATETIME}}
- **ベースリポジトリ**: `git@github.com:anytime-trial/anytime-lab.git`
- **スタック**: {{Q4_STACK_NAME}}


## 2. 主要エンティティ

以下のエンティティを Prisma schema と CRUD UI で実装する。

{{Q2_ENTITIES_TABLE}}

> [!NOTE]
> エンティティごとに 3 画面（一覧 / 詳細 / 新規作成）と tRPC ルータ（list / get / create / update / delete）を生成する。


## 3. 認証

- **方式**: {{Q3_AUTH}}
- **実装**: NextAuth Prisma Adapter
- **保護対象画面**: 全エンティティの一覧・詳細・新規作成（未認証ならログイン誘導）


## 4. スタック構成

{{Q4_STACK_DETAIL}}


## 5. デザイン

- **参照源**: {{Q5_DESIGN_SOURCE}}
- **値**: {{Q5_DESIGN_VALUE}}
- **適用範囲**: `tailwind.config.ts`（colors / fontFamily / spacing / borderRadius / boxShadow）と `globals.css`（base + ダーク/ライト）


## 6. 完了条件

T3 経路 ({{Q4_STACK_NAME}} = `T3 Stack` の場合):

- [ ] Dev Container build が成功する
- [ ] `npm install` が成功する
- [ ] `npx prisma migrate dev --name init` が成功する
- [ ] `npm run dev` が起動し、WSL ホストブラウザで `http://localhost:3000` が表示される
- [ ] 全エンティティの一覧画面が空状態で表示される
- [ ] `npm run lint` が通る
- [ ] `npm test` が通る（最小スモークテスト）

Python BE 経路 ({{Q4_STACK_NAME}} = `Next.js + FastAPI (Python BE)` の場合):

- [ ] Dev Container build が成功する (--new-dir モード) または `uv venv && uv sync` が成功する (in-place)
- [ ] `(cd backend && uv run alembic upgrade head)` が成功する
- [ ] `(cd backend && uv run uvicorn app.main:app)` が起動し `http://localhost:8000/healthz` が 200
- [ ] `(cd frontend && npm install)` が成功する
- [ ] `(cd frontend && npm run gen:api)` で TS クライアントが再生成され `git diff src/api/` が空
- [ ] `(cd frontend && npm run dev)` が起動し `http://localhost:3000` が表示される
- [ ] 全エンティティの一覧画面が空状態で表示される (FastAPI から空配列を受信)
- [ ] `(cd backend && uv run ruff check)` が通る
- [ ] `(cd backend && uv run pytest)` + `(cd frontend && npm test)` が通る（最小スモークテスト）


## 7. 非対象

本 MVP では以下を含まない。

- 本番デプロイ（Vercel / Cloudflare 等）
- CI/CD（GitHub Actions 等）
- 国際化（i18n）
- アクセス制御（RBAC）
- 監査ログ・通知
- 課金・サブスクリプション

これらは別途追加機能として扱う。
```


## プレースホルダ仕様

| プレースホルダ | 内容 | 由来 | 必須 |
| --- | --- | --- | --- |
| `{{Q1_PROJECT_PURPOSE}}` | プロジェクト目的 1 文 | Q1 | ◯ |
| `{{Q2_ENTITIES_TABLE}}` | エンティティ表（Markdown table） | Q2 から生成 | ◯ |
| `{{Q3_AUTH}}` | 認証方式の人間可読表記 | Q3 | ◯（無し選択時は `無し`） |
| `{{Q5_DESIGN_SOURCE}}` | `無し` / `参考 URL` / `DESIGN.md ファイル` | Q5 | ◯ |
| `{{Q5_DESIGN_VALUE}}` | URL or ファイルパス | Q5 | △（Q5=無し 時は `(なし)`） |
| `{{Q4_STACK_NAME}}` | `T3 Stack` または `Next.js + FastAPI (Python BE)` | Q4 + `stacks/*.md` | ◯ |
| `{{Q4_STACK_DETAIL}}` | 該当 stacks/*.md を引用 (T3 経路: `_frontend-next.md` + `t3-default.md` / Python BE 経路: `_frontend-next.md` + `python-be.md`) | Q4 | ◯ |
| `{{TODAY_ISO_DATE}}` | `YYYY-MM-DD` | Phase 1 実行時刻 | ◯ |
| `{{TODAY_ISO_DATETIME}}` | `YYYY-MM-DDTHH:mm:ss.sssZ` | Phase 1 実行時刻 | ◯ |


### Q5 プレースホルダの組み合わせ

`{{Q5_DESIGN_SOURCE}}` と `{{Q5_DESIGN_VALUE}}` は常にペアで置換する。

| Q5 回答 | `{{Q5_DESIGN_SOURCE}}` | `{{Q5_DESIGN_VALUE}}` |
| --- | --- | --- |
| (a) 無し | `無し` | `(なし)` |
| (b) 参考 URL | `参考 URL` | URL 文字列 |
| (c) DESIGN.md ファイル | `DESIGN.md ファイル` | ファイルパス文字列 |


## エンティティ表の生成例

Q2 で `Customer, Order, Product` が回答された場合の `{{Q2_ENTITIES_TABLE}}` 出力:

```markdown
| エンティティ | 必須フィールド（推定） | リレーション（推定） |
| --- | --- | --- |
| `Customer` | `id`・`name`・`email`・`createdAt` | `orders: Order[]` |
| `Order` | `id`・`customerId`・`status`・`createdAt` | `customer: Customer`・`items: OrderItem[]` |
| `Product` | `id`・`name`・`price`・`createdAt` | （なし） |
```

> [!IMPORTANT]
> リレーションは Phase 1 で確定せず、Phase 2 の `writing-plans` 内で再確認する余地を残す。
