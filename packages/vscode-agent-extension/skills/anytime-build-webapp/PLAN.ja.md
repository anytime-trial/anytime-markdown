---
title: "anytime-build-webapp スキル実装計画"
date: "2026-05-17"
type: "plan"
lang: "ja"
author: "Claude Code v2.1.143"
category: "skill"
excerpt: "anytime-build-webapp スキル（要求から T3 Stack MVP を anytime-lab ベースで生成するオーケストレータ）の実装計画。ファイル 7 本を順に作成し E2E 動作確認まで行う。"
clarity: 92
---


# anytime-build-webapp スキル実装計画


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/skills/anytime-build-webapp/` に、要求から T3 Stack MVP を `anytime-lab` クローン + リネーム + T3 重ね合わせで生成するオーケストレータスキルを実装する。

**Architecture:** 7 本の設定ファイル（markdown / json）で構成。`SKILL.md` がメインオーケストレータで、6 つの Phase を順に実行し、Phase 2 と Phase 5 だけ既存 superpowers（`writing-plans` / `executing-plans`）に委譲、Phase 4.5 で `design-md` スキルを利用する。コードは生成せず、Claude Code が SKILL.md の指示に従って動作する宣言的構成。

**Tech Stack:** Markdown（CommonMark + GFM）/ JSON / YAML frontmatter。Validator は `~/.claude/scripts/validate-markdown.sh` と `jq`。


---


## 前提とブランチ運用


- 作業対象は `~/.claude/`（git repo、`master` 単一ブランチ運用）
- worktree は使用しない（個人 config repo の慣例）
- 各タスク完了時にファイル単位で commit する（`git add` はファイル名明示）
- 設計書は `.claude/skills/anytime-build-webapp/DESIGN.ja.md` を正とする


## ファイル構成（実装対象）


```text
.claude/skills/anytime-build-webapp/
├── SKILL.md                    # Task 7
├── DESIGN.ja.md                # 既存（設計書）
├── PLAN.ja.md                  # 本ファイル
├── questions.md                # Task 5
├── requirements-template.md    # Task 6
├── stacks/
│   ├── t3-default.md           # Task 3
│   └── overrides.md            # Task 4
└── scaffold/
    ├── base-repo.md            # Task 1
    └── rename-map.json         # Task 2
```


---


## Task 1: scaffold/base-repo.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/scaffold/base-repo.md`

- [ ] **Step 1: ディレクトリ作成**

Run: `mkdir -p .claude/skills/anytime-build-webapp/scaffold`
Expected: 無出力（成功時）

- [ ] **Step 2: base-repo.md を作成**

ファイル内容:

````markdown
# ベースリポジトリ仕様

`/anytime-build-webapp` の Phase 4（Scaffold）で使用するベースリポジトリの取得と前処理を定義する。


## 1. クローン元

| 項目 | 値 |
| --- | --- |
| Origin | `git@github.com:anytime-trial/anytime-lab.git` |
| 取得方法 | `git clone --depth 1` |
| 認証 | SSH 鍵（`~/.ssh/id_*` がホストマウント済み前提） |


## 2. 取得手順

実行ディレクトリは新規プロジェクトの親ディレクトリ。

```bash
# 1. クローン（履歴不要、depth=1）
git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git <project-name>

# 2. .git を削除（履歴リセット）
rm -rf <project-name>/.git

# 3. リネーム置換適用（rename-map.json 参照）
#    → 詳細は scaffold/rename-map.json と SKILL.md の Phase 4 手順を参照

# 4. 新規 git 初期化
cd <project-name>
git init
```


## 3. 取得直後の期待ファイル

クローン直後に以下のファイル / ディレクトリが存在することを `ls` で確認する。\
1 つでも欠ければ Phase 4 を中断し、ユーザに `anytime-lab` 構成変更の有無を確認する。

| パス | 種別 |
| --- | --- |
| `.devcontainer/devcontainer.json` | ファイル |
| `Dockerfile` | ファイル |
| `docker-compose.yml` | ファイル |
| `package.json` | ファイル |
| `README.md` | ファイル |


## 4. 取得失敗時の対処

| エラー | 対処 |
| --- | --- |
| `Permission denied (publickey)` | `ssh -T git@github.com` で SSH 鍵を確認、ユーザに案内 |
| `Could not resolve hostname github.com` | ネットワーク到達性を診断、`ping github.com` を案内 |
| `Repository not found` | リポジトリアクセス権をユーザに確認、`gh repo view anytime-trial/anytime-lab` を案内 |


## 5. リトライ責任

本ファイルの手順実行責任は **`SKILL.md` の Phase 4** にある。\
失敗時は Phase 4 内でユーザ確認のうえ再試行する（自動リトライしない）。
````

Write the file using the Write tool.

- [ ] **Step 3: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/scaffold/base-repo.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 4: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/scaffold/base-repo.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): scaffold/base-repo.md を追加

anytime-lab クローン手順・期待ファイル・取得失敗時の対処を定義。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: `[master <hash>] feat(anytime-build-webapp): scaffold/base-repo.md を追加`


---


## Task 2: scaffold/rename-map.json を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/scaffold/rename-map.json`

- [ ] **Step 1: rename-map.json を作成**

ファイル内容:

```json
{
  "$schema": "https://json.schemastore.org/anytime-build-webapp-rename-map.json",
  "description": "anytime-lab クローン後の文字列置換マップ。<project-name> は Phase 4 で実プロジェクト名に置換される。",
  "replacements": [
    { "find": "anytime-lab", "replace": "<project-name>" }
  ],
  "targets": [
    "package.json",
    "docker-compose.yml",
    ".devcontainer/devcontainer.json",
    "README.md"
  ],
  "validations": [
    {
      "file": "package.json",
      "jsonpath": "$.name",
      "expected": "<project-name>"
    },
    {
      "file": "docker-compose.yml",
      "regex": "services:\\s*\\n\\s*<project-name>:",
      "expected": "match"
    }
  ]
}
```

Write the file using the Write tool.

- [ ] **Step 2: jq で構文検証**

Run: `jq . .claude/skills/anytime-build-webapp/scaffold/rename-map.json > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: 必須キー存在チェック**

Run: `jq -e '.replacements and .targets and .validations' .claude/skills/anytime-build-webapp/scaffold/rename-map.json`
Expected: `true`

- [ ] **Step 4: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/scaffold/rename-map.json && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): scaffold/rename-map.json を追加

anytime-lab → <project-name> の置換対象と置換後の検証ルールを定義。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 3: stacks/t3-default.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/stacks/t3-default.md`

- [ ] **Step 1: ディレクトリ作成**

Run: `mkdir -p .claude/skills/anytime-build-webapp/stacks`
Expected: 無出力

- [ ] **Step 2: t3-default.md を作成**

ファイル内容:

````markdown
# T3 Stack デフォルト構成

`anytime-lab` クローン + リネーム後に重ね合わせる T3 Stack の構成定義。


## 1. 追加するパッケージ

クローン後のプロジェクトルートで以下を実行する。

```bash
# Runtime dependencies
npm install \
  next@^15 \
  react@^19 \
  react-dom@^19 \
  @trpc/server@^11 \
  @trpc/client@^11 \
  @trpc/react-query@^11 \
  @trpc/next@^11 \
  @tanstack/react-query@^5 \
  prisma@^6 \
  @prisma/client@^6 \
  tailwindcss@^4 \
  @next-auth/prisma-adapter@^1 \
  next-auth@^5 \
  zod@^3

# Dev dependencies
npm install -D \
  typescript@^5 \
  @types/react@^19 \
  @types/node@^24 \
  autoprefixer@^10 \
  postcss@^8 \
  eslint@^9 \
  eslint-config-next@^15 \
  vitest@^2 \
  @playwright/test@^1
```


## 2. 追加する package.json scripts

`package.json` の `scripts` セクションに以下を追記する。

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```


## 3. 追加する Prisma 設定

`npx prisma init --datasource-provider postgresql` を実行後、`prisma/schema.prisma` を以下に上書きする。

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === 認証関連（NextAuth Prisma Adapter 必須スキーマ） ===

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]

  // === エンティティリレーション（Phase 4 で動的追加） ===
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// === アプリエンティティ（Phase 4 で 5 問インタビュー Q2 から動的追加） ===
```

Phase 4 では Q2 の主要エンティティ（例: `Customer`・`Order`）を本ファイル末尾に追記する。


## 4. 追加する Tailwind 設定

`npx tailwindcss init -p` を実行後、`tailwind.config.ts` を以下に上書きする。

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Phase 4.5 でデザイントークンが反映される
    },
  },
  plugins: [],
};

export default config;
```


## 5. 追加する docker-compose.yml の Postgres サービス

クローン後の `docker-compose.yml` の `services:` セクションに以下を追記する。

```yaml
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 5
```

`volumes:` セクション（ファイル末尾）に以下を追記する。

```yaml
volumes:
  pgdata:
```

app サービスの `environment:` に以下を追記する。

```yaml
      DATABASE_URL: postgres://app:app@db:5432/app
```

app サービスの `depends_on:` に以下を追記する（無ければ新規作成）。

```yaml
    depends_on:
      db:
        condition: service_healthy
```


## 6. 追加する Dockerfile 変更

`local` ステージに以下を追記する。

```dockerfile
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g prisma
```


## 7. 追加する .devcontainer/devcontainer.json 変更

| キー | 操作 | 値 |
| --- | --- | --- |
| `forwardPorts` | 既存配列に追加 | `5432` |
| `postCreateCommand` | 設定（無ければ追加） | `"npm install && npx prisma migrate dev --name init"` |
| `customizations.vscode.extensions` | 既存配列に追加 | `"Prisma.prisma"`・`"bradlc.vscode-tailwindcss"`・`"dbaeumer.vscode-eslint"` |


## 8. 追加する src/ ディレクトリ構造

以下のディレクトリ・ファイルを作成する（各ファイルの内容は SKILL.md の Phase 4 手順で指定）。

```text
src/
├── app/
│   ├── layout.tsx              # ルートレイアウト（globals.css 読み込み + Providers）
│   ├── page.tsx                # トップページ
│   ├── globals.css             # Tailwind directives + 基底 CSS
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth ハンドラ
│   │   └── trpc/[trpc]/route.ts          # tRPC ハンドラ
│   └── <entity>/                # Q2 エンティティごとに作成
│       ├── page.tsx             # 一覧
│       ├── [id]/page.tsx        # 詳細
│       └── new/page.tsx         # 新規作成
├── server/
│   ├── api/
│   │   ├── trpc.ts              # tRPC 初期化
│   │   ├── root.ts              # appRouter（エンティティルータを束ねる）
│   │   └── routers/
│   │       └── <entity>.ts      # Q2 エンティティごとの CRUD ルータ
│   ├── auth.ts                  # NextAuth 設定（Prisma Adapter）
│   └── db.ts                    # PrismaClient シングルトン
└── lib/
    └── trpc-react.ts            # tRPC React クライアント
```


## 9. 完了条件

Phase 4 完了時、以下が全て満たされていること。

- `package.json` の `dependencies` に T3 関連パッケージが含まれる
- `prisma/schema.prisma` が NextAuth + Q2 エンティティを含む
- `docker-compose.yml` に `db` サービスと `pgdata` ボリュームがある
- `src/app/`・`src/server/`・`src/lib/` のディレクトリ構造が存在する
- `npm run lint` が通る（type エラーなし）
````

Write the file using the Write tool.

- [ ] **Step 3: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/stacks/t3-default.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 4: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/stacks/t3-default.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): stacks/t3-default.md を追加

anytime-lab 重ね合わせ用の T3 Stack 構成定義
(パッケージ・schema・tailwind・compose・dockerfile・devcontainer 差分・src 構造)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 4: stacks/overrides.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/stacks/overrides.md`

- [ ] **Step 1: overrides.md を作成**

ファイル内容:

````markdown
# スタック上書きルール

5 問インタビュー Q4 の回答に基づいて、デフォルトの T3 Stack を上書きする分岐ルール。


## 1. 判定マトリクス

| Q4 回答 | 分岐先 | 適用変更 | 初期リリース対応 |
| --- | --- | --- | --- |
| 無し / `T3 で` | `stacks/t3-default.md` | 変更無し | ◯ |
| `Python BE で` | `stacks/python-be.md`（将来） | tRPC を FastAPI に差し替え、Python サービスを compose 追加 | × 未対応 |
| `Hono BE で` | `stacks/hono-be.md`（将来） | tRPC を Hono REST に差し替え | × 未対応 |
| `Rails で` | `stacks/rails-hotwire.md`（将来） | T3 全体を Rails + Hotwire に差し替え | × 未対応 |
| その他 | T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 | ◯ |


## 2. 初期リリースの方針（YAGNI）

本リリースでは `t3-default` のみを実装する。\
`python-be` / `hono-be` / `rails-hotwire` は使用実績が出てから追加する。

未対応スタックを Q4 で選んだ場合は SKILL.md の Phase 1.5 で以下のメッセージを出してユーザに確認する。

```text
指定されたスタック「<Q4 回答>」は本スキルの初期リリースで未対応です。
T3 Stack デフォルトで進めて良いですか? (y/N)
```

`N` の場合は処理を中断し、対応スタック追加リクエストとしてユーザに通知する。


## 3. 将来追加時の手順

新スタックを追加する場合の手順を残す。

1. `stacks/<stack-name>.md` を新規作成し、`t3-default.md` 同等の構成を記述
2. 本ファイルの判定マトリクスの該当行を「◯ 対応」に更新
3. SKILL.md の Phase 4 分岐に新スタック処理を追記
4. 手動 E2E テストで動作確認
````

Write the file using the Write tool.

- [ ] **Step 2: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/stacks/overrides.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 3: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/stacks/overrides.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): stacks/overrides.md を追加

Q4 スタック上書きの判定マトリクスと初期リリース範囲 (t3-default のみ) を定義。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 5: questions.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/questions.md`

- [ ] **Step 1: questions.md を作成**

ファイル内容:

````markdown
# 5 問インタビュー定義

`/anytime-build-webapp` の Phase 1（Interview）で順に質問する 5 問の定義。


## 0. 共通ルール

- 質問数は最大 5。打ち切り条件（第 6 章）に該当した時点で停止
- 各質問は ≤ 2 文、選択肢があれば必ず提示
- 多選択を強制しない（`AskUserQuestion` で multiSelect=false を基本とする）
- 回答は `requirements-template.md` のプレースホルダに埋め込む


## 1. Q1: 何を作る?

| 項目 | 値 |
| --- | --- |
| 質問文 | 「何を作りますか? 1 文で教えてください（例: 顧客管理ツール / 在庫管理 / ブログ）。」 |
| 形式 | フリーテキスト |
| デフォルト | （無し・必須） |
| 埋め込み先 | `requirements-template.md` の `{{Q1_PROJECT_PURPOSE}}` |


## 2. Q2: 主要エンティティ

| 項目 | 値 |
| --- | --- |
| 質問文 | 「主要エンティティを 3 つ以下で挙げてください（例: `User`, `Customer`, `Order`）。」 |
| 形式 | カンマ区切りフリーテキスト |
| デフォルト | （無し・必須） |
| 埋め込み先 | `requirements-template.md` の `{{Q2_ENTITIES}}` |
| バリデーション | 3 つ以下、PascalCase、`User` 以外 |


## 3. Q3: 認証方式

| 項目 | 値 |
| --- | --- |
| 質問文 | 「認証はどうしますか?」 |
| 形式 | 選択肢（3 択） |
| 選択肢 | (a) 無し　(b) メールパスワード　(c) OAuth: Google |
| デフォルト | (b) メールパスワード |
| 埋め込み先 | `requirements-template.md` の `{{Q3_AUTH}}` |


## 4. Q4: スタック上書き

| 項目 | 値 |
| --- | --- |
| 質問文 | 「スタックの上書き指定はありますか?」 |
| 形式 | 選択肢（4 択） |
| 選択肢 | (a) 無し（T3 デフォルト）　(b) Python BE　(c) Hono BE　(d) その他 |
| デフォルト | (a) 無し |
| 埋め込み先 | `requirements-template.md` の `{{Q4_STACK_OVERRIDE}}` |
| 備考 | (b)〜(d) 選択時は `stacks/overrides.md` の判定に従う |


## 5. Q5: 画面デザイン参照源

| 項目 | 値 |
| --- | --- |
| 質問文 | 「画面デザインの参照源はありますか?」 |
| 形式 | 選択肢（3 択） |
| 選択肢 | (a) 無し（標準 Tailwind）　(b) 参考 URL を指定　(c) DESIGN.md ファイルパスを指定 |
| デフォルト | (a) 無し |
| 埋め込み先 | `requirements-template.md` の `{{Q5_DESIGN_SOURCE}}`・`{{Q5_DESIGN_VALUE}}` |
| 備考 | (b) / (c) を選んだ場合、続けて URL / パスをフリーテキストで入力 |


## 6. 打ち切り条件

以下のいずれかに該当した時点で残り質問をスキップ。

- Q1〜Q3 が明確で Q4・Q5 が CLI 引数で事前指定済み
- 1 問で 3 つ以上の情報が出てきた場合（例: Q1 で「`User` と `Order` の顧客管理ツール、Google 認証で」→ Q1・Q2・Q3 を一括充足）
- 5 問終了時点で曖昧な点が残る場合は「想定 X で進めます。違えば指示してください」と表明して継続


## 7. CLI 引数による事前充足

| CLI 引数 | スキップする質問 |
| --- | --- |
| `<1 行の要求>` | Q1 |
| `--design-url <URL>` | Q5（参考 URL） |
| `--design-file <path>` | Q5（DESIGN.md ファイル） |
| `--no-auth` | Q3（無し） |
| `--auth=email-password` | Q3（メールパスワード） |
| `--auth=google` | Q3（OAuth: Google） |


## 8. 質問順序の優先

Q1 → Q2 → Q3 → Q4 → Q5 の固定順。Q4 が「無し」以外で未対応スタックの場合、Phase 1.5 で確認質問を 1 回追加するが本 5 問の枠外。
````

Write the file using the Write tool.

- [ ] **Step 2: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/questions.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 3: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/questions.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): questions.md を追加

5 問インタビューの質問文・形式・選択肢・デフォルト・埋め込み先と
打ち切り条件・CLI 引数による事前充足を定義。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 6: requirements-template.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/requirements-template.md`

- [ ] **Step 1: requirements-template.md を作成**

ファイル内容:

````markdown
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
- **スタック**: {{STACK_NAME}}


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

{{STACK_DETAIL_FROM_T3_DEFAULT_OR_OVERRIDE}}


## 5. デザイン

- **参照源**: {{Q5_DESIGN_SOURCE}}
- **値**: {{Q5_DESIGN_VALUE}}
- **適用範囲**: `tailwind.config.ts`（colors / fontFamily / spacing / borderRadius / boxShadow）と `globals.css`（base + ダーク/ライト）


## 6. 完了条件

- [ ] Dev Container build が成功する
- [ ] `npm install` が成功する
- [ ] `npx prisma migrate dev --name init` が成功する
- [ ] `npm run dev` が起動し、WSL ホストブラウザで `http://localhost:3000` が表示される
- [ ] 全エンティティの一覧画面が空状態で表示される
- [ ] `npm run lint` が通る
- [ ] `npm test` が通る（最小スモークテスト）


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

| プレースホルダ | 内容 | 由来 |
| --- | --- | --- |
| `{{Q1_PROJECT_PURPOSE}}` | プロジェクト目的 1 文 | Q1 |
| `{{Q2_ENTITIES_TABLE}}` | エンティティ表（Markdown table） | Q2 から生成 |
| `{{Q3_AUTH}}` | 認証方式の人間可読表記 | Q3 |
| `{{Q5_DESIGN_SOURCE}}` | `無し` / `参考 URL` / `DESIGN.md ファイル` | Q5 |
| `{{Q5_DESIGN_VALUE}}` | URL or ファイルパス（無しなら `(なし)`） | Q5 |
| `{{STACK_NAME}}` | `T3 Stack` 等 | Q4 + `stacks/*.md` |
| `{{STACK_DETAIL_FROM_T3_DEFAULT_OR_OVERRIDE}}` | 該当 stacks/*.md を引用 | Q4 |
| `{{TODAY_ISO_DATE}}` | `YYYY-MM-DD` | Phase 1 実行時刻 |
| `{{TODAY_ISO_DATETIME}}` | `YYYY-MM-DDTHH:mm:ss.sssZ` | Phase 1 実行時刻 |


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
````

Write the file using the Write tool.

- [ ] **Step 2: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/requirements-template.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 3: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/requirements-template.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): requirements-template.md を追加

writing-plans に渡す要件 md の雛形とプレースホルダ仕様を定義。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 7: SKILL.md を作成


**Files:**

- Create: `.claude/skills/anytime-build-webapp/SKILL.md`

- [ ] **Step 1: SKILL.md を作成**

ファイル内容:

````markdown
---
name: anytime-build-webapp
description: 要求から T3 Stack フルスタック Web アプリの MVP を WSL + Dev Container 上に生成する汎用スキル。/anytime-build-webapp で起動し、5 問インタビュー → 要件書生成 → writing-plans → executing-plans を順に呼ぶオーケストレータ。画面デザインは参考 URL または DESIGN.md ファイル指定で適用可能。
---


# anytime-build-webapp スキル


`/anytime-build-webapp` 起動時に本ファイルがロードされる。以下の Phase 1〜6 を順に実行する。


## 起動形式


```text
/anytime-build-webapp <1行の要求> [--design-url <URL>] [--design-file <path>]
                          [--no-auth | --auth=email-password | --auth=google]
                          [--force]
```


## 起動前チェック


以下のいずれかに該当する場合、即座に中断してユーザに通知する。

- CWD が空ディレクトリでない（`ls -A` で出力あり）かつ `--force` 無し
- `docker info` が失敗する（Docker daemon 未起動）
- `ssh -T git@github.com` の戻り値が 1 でない（SSH 鍵未設定）

中断時メッセージ例:

```text
[anytime-build-webapp] 中断: CWD が空ではありません。
別の空ディレクトリで実行するか、--force を付けてください。
```


## Phase 1: Interview


1. `.claude/skills/anytime-build-webapp/questions.md` を Read する
2. 起動時 CLI 引数を解析し、`questions.md` 第 7 章の事前充足ルールに従って質問対象を絞る
3. 残った質問を **`AskUserQuestion` ツールで 1 問ずつ**順に実施する
4. 各回答をメモリに保持する（変数: `q1_purpose`・`q2_entities`・`q3_auth`・`q4_stack`・`q5_design`・`q5_design_value`）
5. `questions.md` 第 6 章の打ち切り条件に該当した時点で残り質問をスキップ
6. `.claude/skills/anytime-build-webapp/requirements-template.md` を Read し、プレースホルダを回答で置換
7. 置換後の内容を **CWD/requirements.md** に Write する


### Phase 1.5: 未対応スタックの確認


Q4 が `Python BE` / `Hono BE` / `その他` の場合、`stacks/overrides.md` 第 2 章のメッセージで `AskUserQuestion` を 1 回追加。

- `T3 デフォルトで進める` → Q4 を「無し」に上書きして続行
- `中断する` → Phase 1 で停止し、対応スタック追加リクエストとしてユーザに通知


## Phase 2: Plan


1. **`Skill` ツールで `superpowers:writing-plans` を起動**する
2. 渡すコンテキスト:
   - `requirements.md`（CWD のもの）
   - `.claude/skills/anytime-build-webapp/stacks/t3-default.md`（Q4 = 無しの場合）
   - `.claude/skills/anytime-build-webapp/scaffold/base-repo.md`
3. `writing-plans` が生成したプラン（通常 `docs/superpowers/plans/<date>-<topic>.md`）のパスを保持


## Phase 3: User Approval


1. プランファイルの内容をチャットに要約表示
2. `AskUserQuestion` で承認確認:
   - 「このプランで実装を進めて良いですか?」
   - 選択肢: `OK で進める` / `修正する（Phase 2 に戻る）` / `中断する`
3. `修正する` → Phase 2 を再実行（ユーザに修正点を聞く）
4. `中断する` → 処理停止


## Phase 4: Scaffold


本 Phase は **skill 本体** で完結する。`executing-plans` には委譲しない。


### 4.1. クローン

`scaffold/base-repo.md` 第 2 章の手順に従う。

```bash
git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git <project-name>
rm -rf <project-name>/.git
```

`<project-name>` は `q1_purpose` から導出（kebab-case 化、英数字のみ）。\
失敗時は `scaffold/base-repo.md` 第 4 章の対処に従う。


### 4.2. 期待ファイル検証

`scaffold/base-repo.md` 第 3 章の表のファイルが全て存在することを `test -f` で確認。\
1 つでも欠ければ中断してユーザに通知。


### 4.3. リネーム置換

`scaffold/rename-map.json` を読み込み、`replacements[].find` を `replacements[].replace`（実プロジェクト名）に置換。

- 対象は `targets[]` のファイルのみ
- 置換後、`validations[]` のチェックを実行（jq で `expected` と一致確認）


### 4.4. T3 重ね合わせ

`stacks/t3-default.md` 第 1〜8 章の指示に従って T3 構成を重ね合わせる。

1. パッケージインストール（第 1 章）
2. `package.json` scripts 追記（第 2 章）
3. Prisma 初期化 + schema 上書き（第 3 章）— Q2 エンティティを末尾に追加
4. Tailwind 初期化 + 設定上書き（第 4 章）
5. `docker-compose.yml` に Postgres + volumes 追記（第 5 章）
6. `Dockerfile` に postgres-client + Prisma CLI 追記（第 6 章）
7. `.devcontainer/devcontainer.json` 修正（第 7 章）
8. `src/` ディレクトリ構造作成（第 8 章）


### 4.5. 初期 git commit

```bash
cd <project-name>
git init
git add .
git commit -m "chore: initial scaffold from anytime-lab + T3 Stack"
```

push は行わない。


## Phase 4.5: Apply Design Tokens


Q5 / CLI 引数の値で分岐する。詳細は `DESIGN.ja.md` 第 6.2 章を参照。


### 4.5.1. Q5 = 無し

スキップして Phase 5 へ。


### 4.5.2. Q5 = 参考 URL（`--design-url <URL>`）

1. **`Skill` ツールで `design-md` を起動**し、URL を入力として DESIGN.md を生成
2. 生成された DESIGN.md を `<project-root>/docs/DESIGN.md` に保存
3. 第 4.5.3 と同じ処理に合流


### 4.5.3. Q5 = DESIGN.md ファイル（`--design-file <path>`）

1. 指定パスを Read
2. デザイントークンを抽出（カラー・タイポ・スペーシング・角丸・シャドウ）
3. `tailwind.config.ts` の `theme.extend` に反映
4. `src/app/globals.css` の `:root` / `.dark` セレクタに CSS 変数として反映
5. `npx tsc --noEmit` で TypeScript チェック実行、失敗時は直前の設定にロールバック


## Phase 5: Implementation


1. **`Skill` ツールで `superpowers:executing-plans` を起動**する
2. Phase 2 で生成したプランファイルを渡す
3. `executing-plans` の完了通知（`done` イベント）を待つ
4. 実装中のエラーは `executing-plans` が責任を持つ（Phase 5 内のリトライ）


## Phase 6: Verification


本 Phase は **skill 本体** で完結する。


### 6.1. Dev Container build


```bash
docker compose -f .devcontainer/docker-compose.yml build
# または devcontainer CLI が使える環境では:
devcontainer up --workspace-folder .
```

失敗時は `docker logs` を表示し、ユーザに再試行 / 中断を確認。


### 6.2. アプリ起動


```bash
docker compose -f .devcontainer/docker-compose.yml run --rm app npm run dev &
sleep 10
```

`npm run dev` の起動ログ（stderr 含む）をキャプチャしておく。


### 6.3. 疎通確認


```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000
```

期待: `200`。それ以外の場合は `npm run dev` の出力をダンプしてユーザに通知。


### 6.4. テスト実行


```bash
docker compose -f .devcontainer/docker-compose.yml run --rm app npm test
```

失敗時はテスト出力をユーザに通知（中断はしない）。


### 6.5. 完了通知


チャットに以下を出力:

```text
[anytime-build-webapp] 完了
- プロジェクト: <project-name>
- ベース: anytime-trial/anytime-lab
- スタック: T3 (Next.js + tRPC + Prisma + Tailwind + NextAuth)
- 起動状態: http://localhost:3000 (HTTP 200 確認済み)

次の手順:
1. WSL ホスト側ブラウザで http://localhost:3000 を開いてください
2. VS Code から Reopen in Container でコンテナ内開発を開始できます
```


## 不可逆操作のガード


本スキルは以下を **絶対に行わない**。違反させる指示はユーザに警告のうえ拒否する。

- `main` / `master` への push
- `git push --force`
- ホストの `~/.claude` / `~/.ssh` / `~/Shared` への書き込み
- `rm -rf` をプロジェクトルート外に向ける


## 参照ファイル一覧


| ファイル | 用途 |
| --- | --- |
| `.claude/skills/anytime-build-webapp/DESIGN.ja.md` | 設計書（仕様の正） |
| `.claude/skills/anytime-build-webapp/questions.md` | 5 問インタビュー定義 |
| `.claude/skills/anytime-build-webapp/requirements-template.md` | 要件 md テンプレ |
| `.claude/skills/anytime-build-webapp/stacks/t3-default.md` | T3 重ね合わせ手順 |
| `.claude/skills/anytime-build-webapp/stacks/overrides.md` | スタック上書き判定 |
| `.claude/skills/anytime-build-webapp/scaffold/base-repo.md` | `anytime-lab` クローン手順 |
| `.claude/skills/anytime-build-webapp/scaffold/rename-map.json` | リネーム置換マップ |
````

Write the file using the Write tool.

- [ ] **Step 2: validate-markdown.sh で検証**

Run: `bash ~/.claude/scripts/validate-markdown.sh .claude/skills/anytime-build-webapp/SKILL.md`
Expected: `OK: ... - 検証通過`

- [ ] **Step 3: YAML frontmatter パース検証**

Run: `head -5 .claude/skills/anytime-build-webapp/SKILL.md | python3 -c "import sys, yaml; doc = sys.stdin.read().split('---')[1]; data = yaml.safe_load(doc); assert 'name' in data and 'description' in data; print('OK', data['name'])"`
Expected: `OK anytime-build-webapp`

- [ ] **Step 4: スキル一覧で認識されるか確認**

Run: `claude --print "/help" 2>&1 | grep -c anytime-build-webapp || true`
Expected: 1 以上の数値（スキルロード成功時）。0 ならスキルがロードされていない（次の Step 5 で原因確認）。

> [!NOTE]
> `claude` CLI のスキル列挙オプションが環境により異なる場合、スキップ可。動作の真の確認は Task 8 の E2E で行う。

- [ ] **Step 5: commit**

```bash
cd ~/.claude && git add skills/anytime-build-webapp/SKILL.md && git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): SKILL.md (メインオーケストレータ) を追加

Phase 1〜6 + Phase 4.5 の手順、起動前チェック、不可逆操作ガード、
参照ファイル一覧を定義。/anytime-build-webapp で起動可能になる。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Task 8: E2E スモークテスト


**Files:**

- Test: `/tmp/anytime-build-webapp-e2e-<timestamp>/`（一時ディレクトリ、最後に削除）

> [!IMPORTANT]
> 本タスクは **新しい Claude Code セッション** で実行する。\
> 現セッションは skill ファイルを編集中のため、ロードされない可能性がある。

- [ ] **Step 1: 一時ディレクトリ作成**

```bash
TMPDIR=$(mktemp -d /tmp/anytime-build-webapp-e2e-XXXXXX)
echo "テストディレクトリ: $TMPDIR"
cd "$TMPDIR"
```

Expected: `テストディレクトリ: /tmp/anytime-build-webapp-e2e-XXXXXX`

- [ ] **Step 2: SSH 鍵で anytime-lab に到達可能か事前確認**

```bash
ssh -T git@github.com 2>&1 | head -3
git ls-remote --heads git@github.com:anytime-trial/anytime-lab.git HEAD
```

Expected: 1 行目は GitHub の welcome メッセージ、2 行目は HEAD のハッシュ。\
失敗時は SSH 鍵設定をユーザに案内して中断。

- [ ] **Step 3: 新しい Claude Code セッションを開始し /anytime-build-webapp を実行**

```bash
cd "$TMPDIR"
claude
```

Claude Code セッション内で:

```text
/anytime-build-webapp 顧客管理ツール
```

以下が期待される対話の流れ:

1. Q1 はスキップ（CLI 引数で充足）
2. Q2: 主要エンティティを質問される → 回答例: `Customer, Order`
3. Q3: 認証方式 → 回答例: メールパスワード
4. Q4: スタック上書き → 回答例: 無し
5. Q5: デザイン参照源 → 回答例: 無し
6. `requirements.md` が生成される
7. `writing-plans` 呼び出し → プラン生成
8. プラン承認確認
9. Scaffold 開始（`git clone` → リネーム → T3 重ね合わせ）
10. `executing-plans` 呼び出し
11. 検証 → `curl localhost:3000` で 200 確認

- [ ] **Step 4: 期待ファイル / ディレクトリ確認**

E2E 完了後、`$TMPDIR/<project-name>/` 配下に以下が存在することを確認。

```bash
PROJ=$(ls "$TMPDIR" | head -1)
cd "$TMPDIR/$PROJ"
test -f .devcontainer/devcontainer.json && echo "OK: devcontainer.json"
test -f Dockerfile && echo "OK: Dockerfile"
test -f docker-compose.yml && echo "OK: docker-compose.yml"
test -f package.json && echo "OK: package.json"
test -f prisma/schema.prisma && echo "OK: schema.prisma"
test -f tailwind.config.ts && echo "OK: tailwind.config.ts"
test -d src/app && echo "OK: src/app"
test -d src/server/api/routers && echo "OK: src/server/api/routers"
test -f requirements.md && echo "OK: requirements.md"
grep -q "$PROJ" package.json && echo "OK: package.json リネーム済み"
! grep -q "anytime-lab" package.json && echo "OK: 旧名残り無し"
```

Expected: 全ての行が `OK:` 付きで出力される。

- [ ] **Step 5: 起動確認**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Expected: `200`

- [ ] **Step 6: 後片付け**

```bash
# Dev Container 停止
docker compose -f "$TMPDIR/$PROJ/.devcontainer/docker-compose.yml" down -v

# 一時ディレクトリ削除
rm -rf "$TMPDIR"
echo "削除済み: $TMPDIR"
```

- [ ] **Step 7: 結果記録**

E2E が通った時点で、スキル本体には commit するものは無い。\
ユーザに以下を報告:

- E2E テスト結果（PASS / FAIL）
- 所要時間
- 観察された問題（あれば SKILL.md にフィードバックとして次回改善）


---


## 完了条件（プラン全体）


- Task 1〜7 の全 7 ファイルが `.claude/skills/anytime-build-webapp/` 配下に存在
- 各ファイルが `validate-markdown.sh` / `jq` を通過
- 各タスクが個別 commit されている（合計 7 commits）
- Task 8 の E2E スモークテストが PASS（生成プロジェクトが `http://localhost:3000` で 200 を返す）


## セルフレビュー結果


本プラン作成後にセルフレビュー実施済み。

- **スペック網羅**: DESIGN.ja.md 全 13 章の要件が Task 1〜8 に分配されている
- **プレースホルダ無し**: 全 step に具体的なコマンド / コンテンツ記載済み
- **型整合**: ファイル名・プレースホルダ名（`{{Q1_PROJECT_PURPOSE}}` 等）・コマンド引数（`--design-url` 等）がプラン内で一貫
- **既知の TODO**: スタック上書き（`python-be` / `hono-be`）は YAGNI で `stacks/overrides.md` 第 3 章に将来手順のみ記載
