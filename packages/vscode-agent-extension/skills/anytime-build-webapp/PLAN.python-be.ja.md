---
title: "anytime-build-webapp Python BE 対応 実装計画"
date: "2026-05-17"
type: "plan"
lang: "ja"
author: "Claude Code v2.1.143"
category: "skill"
excerpt: "anytime-build-webapp スキルに stacks/python-be.md を追加し、Q4 = Python BE で Next.js + FastAPI 構成へ差し替える機能拡張の実装プラン。設計書 DESIGN.python-be.ja.md (commit 27119aa) を実装。11 ファイル変更、16 タスク。"
clarity: 92
---


# anytime-build-webapp Python BE 対応 Implementation Plan


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `anytime-build-webapp` スキルの Q4 = Python BE で T3 構成から Next.js + FastAPI 構成へ差し替える機能拡張を実装する。

**Architecture:** 既存スキル定義ファイル群を編集 + 新規ファイル追加。フロント共通パーツを `stacks/_frontend-next.md` に抽出し、`stacks/t3-default.md` と新規 `stacks/python-be.md` がそれぞれ参照する。Python BE 用テンプレファイルは `scaffold/python-be-files/` に集約。

**Tech Stack:** Markdown (skill 定義) / FastAPI 0.115 / SQLAlchemy 2.0 / Alembic 1.13 / python-jose 3.3 / uvicorn 0.32 / uv 0.5 / @hey-api/openapi-ts 0.64 / Auth.js (NextAuth v5)

**Spec:** `/home/user/.claude/skills/anytime-build-webapp/DESIGN.python-be.ja.md` (commit `27119aa`)

**Repository:** `/home/user/.claude/` (個人 dotfiles リポ、master 単一ブランチ運用)

---


## 実行前提と運用ルール


- **作業ブランチ**: `master` 直 commit。worktree / PR 不要（履歴で master 直 commit 運用が確立済み）
- **コミット粒度**: 各 Task ごとに 1 commit
- **add 対象**: ファイル名明示。`git add .` / `-A` / `-a` 禁止
- **コミットメッセージ**: Conventional Commits (`feat(anytime-build-webapp)` / `refactor(anytime-build-webapp)` / `docs(anytime-build-webapp)`)
- **Co-Authored-By 行**: 各 commit に `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` を含める
- **検証コマンド**: `bash ~/.claude/scripts/validate-markdown.sh <file>` を Markdown 変更後に毎回実行
- **TOML / JSON 検証**: `python3 -c "import tomllib; tomllib.load(open('<file>','rb'))"` / `jq -e . <file>`
- **Python 構文検証**: `python3 -m py_compile <file>`（プレースホルダ置換後の妥当性を別途確認する Task を最後に置く）
- **既存未コミット変更を巻き込まない**: 着手時に `git status --short` で対象外ファイルの変更を確認し、Task ごとに対象ファイルのみ stage する


## File Structure


### 新規追加 (10 ファイル)


| パス | 責務 |
| --- | --- |
| `stacks/_frontend-next.md` | Next.js + Tailwind + Auth.js + @hey-api/openapi-ts 共通パーツ。t3-default と python-be から参照される |
| `stacks/python-be.md` | FastAPI + SQLAlchemy + Alembic スタック定義。`_frontend-next.md` を参照 |
| `scaffold/rename-map-python-be.json` | Python BE 用の置換マップ（targets に backend/pyproject.toml 等を追加） |
| `scaffold/python-be-files/backend/pyproject.toml.tmpl` | uv プロジェクト定義、依存パッケージ |
| `scaffold/python-be-files/backend/alembic.ini.tmpl` | Alembic 設定 |
| `scaffold/python-be-files/backend/alembic/env.py.tmpl` | Alembic env (SQLAlchemy 2.0 統合) |
| `scaffold/python-be-files/backend/app/__init__.py.tmpl` | パッケージ初期化 (空) |
| `scaffold/python-be-files/backend/app/db.py.tmpl` | SQLAlchemy engine + Session ファクトリ |
| `scaffold/python-be-files/backend/app/deps.py.tmpl` | get_db / get_current_user (JWT 検証) |
| `scaffold/python-be-files/backend/app/main.py.tmpl` | FastAPI app + /healthz + CORS |


### 既存修正 (5 ファイル)


| パス | 修正内容 |
| --- | --- |
| `stacks/t3-default.md` | 冒頭に `_frontend-next.md` 参照を追加。Next.js / Tailwind 重複部分を `_frontend-next.md` 側に集約済みである旨を明示 |
| `stacks/overrides.md` | 判定マトリクス更新 (Python BE: ◯ 対応)、第 2 章「初期リリース YAGNI」記述から python-be を除外 |
| `SKILL.md` | Phase 1.5 判定で Python BE を対応スタック扱い / Phase 4 分岐に Q4 = Python BE 経路を追加 / Phase 6 検証に backend healthz 追加 |
| `requirements-template.md` | `{{Q4_STACK_NAME}}` の値マッピング表に Python BE 追加、`{{Q4_STACK_DETAIL}}` の出し分けサンプル追加、完了条件に Python BE 経路を追記 |
| `DESIGN.ja.md` | 第 8 章判定マトリクス更新、第 12 章将来拡張から python-be を削除、本 spec への参照追記 |


### 触らない (4 ファイル)


| パス | 理由 |
| --- | --- |
| `scaffold/base-repo.md` | anytime-lab クローン手順は共通 |
| `scaffold/rename-map.json` | T3 用は現状維持。Python BE は別 JSON |
| `questions.md` | 5 問の質問文・選択肢は変更なし |
| `PLAN.ja.md` | 過去の skill 構築プラン、参照専用 |


---


## Phase A: フロントエンド共通基盤の抽出


t3-default の Next.js / Tailwind 部分を `_frontend-next.md` に移動し、Auth.js (NextAuth v5) と `@hey-api/openapi-ts` を追加する共通モジュール化フェーズ。


### Task 1: stacks/_frontend-next.md を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/stacks/_frontend-next.md`


- [ ] **Step 1: 着手前確認**

```bash
cd /home/user/.claude
git status --short skills/anytime-build-webapp/stacks/
git branch --show-current
```

Expected: `_frontend-next.md` は未存在、ブランチは `master`。


- [ ] **Step 2: ファイル新規作成 (Write tool)**

ファイル内容:

````markdown
# フロントエンド共通スタック（Next.js + Tailwind + Auth.js）

`stacks/t3-default.md` と `stacks/python-be.md` の両方から参照される共通パーツ。

> [!IMPORTANT]
> 本ファイルは **単独適用不可・参照専用**。\
> `t3-default.md` か `python-be.md` 経由でのみ呼ばれる。


## 1. 追加するパッケージ

クローン後の `frontend/`（または T3 経路ではプロジェクトルート）で実行。

```bash
# Runtime dependencies
npm install \
  next@^15 \
  react@^19 \
  react-dom@^19 \
  @tanstack/react-query@^5 \
  tailwindcss@^3 \
  next-auth@^5 \
  zod@^3

# Dev dependencies
npm install -D \
  typescript@^5 \
  @types/react@^19 \
  @types/node@^22 \
  autoprefixer@^10 \
  postcss@^8 \
  eslint@^9 \
  eslint-config-next@^15 \
  vitest@^2 \
  @playwright/test@^1 \
  @hey-api/openapi-ts@^0.64
```


## 2. 追加する package.json scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "gen:api": "openapi-ts"
  }
}
```

`gen:api` は Python BE 経路でのみ使用。T3 経路では tRPC が型を持つため未使用 (定義はしておく)。


## 3. 追加する Tailwind 設定

`npx tailwindcss init -p` 実行後、`tailwind.config.ts` を以下に上書き。

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


## 4. 追加する Auth.js (NextAuth v5) 設定

Q3 の回答により分岐する。


### 4.1. Q3 = 無し

NextAuth を install しない（第 1 章から `next-auth` を除外）。\
`src/lib/auth.ts` / `src/app/api/auth/[...nextauth]/route.ts` を作成しない。


### 4.2. Q3 = メールパスワード

`src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL!;
        const res = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { id: data.user.id, email: data.user.email, accessToken: data.access_token };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.accessToken = (user as { accessToken: string }).accessToken;
      return token;
    },
    session: async ({ session, token }) => {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
export { GET, POST } from "@/lib/auth";
```


### 4.3. Q3 = OAuth Google

`src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    jwt: async ({ token, account, profile }) => {
      if (account && profile) {
        const jwt = await new SignJWT({ sub: profile.email, email: profile.email, name: profile.name })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("7d")
          .sign(secret);
        token.accessToken = jwt;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});
```


## 5. 追加する @hey-api/openapi-ts 設定

Python BE 経路でのみ使用。T3 経路では設定ファイルを生成するが `npm run gen:api` を呼ばない。

`frontend/openapi-ts.config.ts` (Python BE 経路) / `openapi-ts.config.ts` (T3 経路、ルート配置):

```typescript
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: process.env.OPENAPI_URL ?? "http://localhost:8000/openapi.json",
  output: {
    path: "src/api",
    format: "prettier",
  },
  plugins: ["@hey-api/client-fetch", "@hey-api/schemas", "@hey-api/sdk", "@hey-api/typescript"],
});
```


## 6. 追加する src/ ディレクトリ構造

`src/` 以下を作成 (`<entity>` は Q2 エンティティごとに繰り返し)。

```text
src/
├── app/
│   ├── layout.tsx          # ルートレイアウト (globals.css + Providers)
│   ├── page.tsx            # トップページ
│   ├── globals.css         # Tailwind directives
│   └── <entity>/
│       ├── page.tsx        # 一覧
│       ├── [id]/page.tsx   # 詳細
│       └── new/page.tsx    # 新規
├── lib/
│   └── auth.ts             # NextAuth 設定 (Q3 別、第 4 章参照)
└── api/                    # @hey-api/openapi-ts 出力 (Python BE 経路のみ)
```


## 7. globals.css 最小定義

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```


## 8. .env.local テンプレ

```dotenv
# 共通
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Q3 が無し以外
AUTH_SECRET=<openssl rand -base64 32 で生成>
NEXTAUTH_URL=http://localhost:3000

# Q3 = Google のみ
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`NEXT_PUBLIC_API_BASE_URL` は T3 経路では未使用 (tRPC が同一プロセス)。\
Python BE 経路では必須 (frontend → backend へのクロスオリジン)。
````


- [ ] **Step 3: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/stacks/_frontend-next.md
```

Expected: `OK: ... - 検証通過`


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/stacks/_frontend-next.md
git status --short skills/anytime-build-webapp/stacks/_frontend-next.md
git diff --cached --stat skills/anytime-build-webapp/stacks/_frontend-next.md
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): フロント共通スタック _frontend-next.md を追加

t3-default と python-be (今後追加) の両方から参照される Next.js + Tailwind +
Auth.js + @hey-api/openapi-ts の共通パーツを定義。Q3 別認証 (無し/メールパスワード/Google) も本ファイルで記述。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: `1 file changed, ~250 insertions(+)`


---


### Task 2: stacks/t3-default.md を _frontend-next.md 参照に修正


**Files:**
- Modify: `/home/user/.claude/skills/anytime-build-webapp/stacks/t3-default.md`

t3-default の Next.js / Tailwind / package.json scripts 部分は _frontend-next.md と重複する。冒頭に参照を追加し、重複部分をシンプル化する。


- [ ] **Step 1: 既存内容の再確認**

```bash
grep -n "^##" /home/user/.claude/skills/anytime-build-webapp/stacks/t3-default.md
```

Expected output: 章番号一覧が表示される (`## 1.` 〜 `## 9.`)。


- [ ] **Step 2: 冒頭追加 (Edit tool)**

`old_string`:

```text
# T3 Stack デフォルト構成

`anytime-lab` クローン + リネーム後に重ね合わせる T3 Stack の構成定義。


## 1. 追加するパッケージ
```

`new_string`:

```text
# T3 Stack デフォルト構成

`anytime-lab` クローン + リネーム後に重ね合わせる T3 Stack の構成定義。

> [!IMPORTANT]
> Next.js / Tailwind / Auth.js / package.json scripts / src/ ディレクトリ構造の共通部分は **`stacks/_frontend-next.md`** に集約済み。\
> 本ファイルは T3 固有の差分（**tRPC・Prisma・Postgres compose・Dockerfile**）のみを記述する。


## 0. 前提

`_frontend-next.md` の第 1〜8 章をすべて先に適用してから、本ファイルの第 1 章以降を重ね合わせる。\
`_frontend-next.md` 第 1 章のパッケージに加えて、本ファイル第 1 章で tRPC + Prisma 系を追記する。


## 1. 追加するパッケージ
```


- [ ] **Step 3: 第 1 章のパッケージリストを T3 固有のみに削減 (Edit tool)**

`old_string`:

```text
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
  @tanstack/react-query@^5 \
  prisma@^6 \
  @prisma/client@^6 \
  tailwindcss@^3 \
  @next-auth/prisma-adapter@^1 \
  next-auth@^5 \
  zod@^3

# Dev dependencies
npm install -D \
  typescript@^5 \
  @types/react@^19 \
  @types/node@^22 \
  autoprefixer@^10 \
  postcss@^8 \
  eslint@^9 \
  eslint-config-next@^15 \
  vitest@^2 \
  @playwright/test@^1
```
```

`new_string`:

```text
## 1. 追加するパッケージ

`_frontend-next.md` 第 1 章を適用済みの前提で、T3 固有パッケージを追加する。

```bash
# Runtime dependencies (T3 固有)
npm install \
  @trpc/server@^11 \
  @trpc/client@^11 \
  @trpc/react-query@^11 \
  prisma@^6 \
  @prisma/client@^6 \
  @next-auth/prisma-adapter@^1
```
```


- [ ] **Step 4: 第 2 章 (scripts) を Prisma 固有スクリプトのみに削減 (Edit tool)**

`old_string`:

```text
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
```

`new_string`:

```text
## 2. 追加する package.json scripts

`_frontend-next.md` 第 2 章を適用済みの前提で、Prisma 固有スクリプトを追加する。

```json
{
  "scripts": {
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  }
}
```
```


- [ ] **Step 5: 第 4 章 Tailwind 設定の削減 (Edit tool)**

`old_string`:

```text
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
```

`new_string`:

```text
## 4. 追加する Tailwind 設定

`_frontend-next.md` 第 3 章に集約済み。本章は参照のみ。
```


- [ ] **Step 6: 第 8 章 src ディレクトリ構造の T3 固有差分のみに削減 (Edit tool)**

`old_string`:

```text
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
```

`new_string`:

```text
## 8. 追加する src/ ディレクトリ構造（T3 固有差分）

`_frontend-next.md` 第 6 章の `src/` 構造に加え、以下を T3 固有として追加する。

```text
src/
├── app/
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # NextAuth + Prisma Adapter ハンドラ
│       └── trpc/[trpc]/route.ts          # tRPC ハンドラ
├── server/
│   ├── api/
│   │   ├── trpc.ts                       # tRPC 初期化
│   │   ├── root.ts                       # appRouter
│   │   └── routers/<entity>.ts           # CRUD ルータ
│   ├── auth.ts                           # NextAuth 設定 (Prisma Adapter)
│   └── db.ts                             # PrismaClient シングルトン
└── lib/
    └── trpc-react.ts                     # tRPC React クライアント
```

> [!NOTE]
> `_frontend-next.md` 第 4 章で定義する Auth.js は **Credentials/Google Provider** を使うが、T3 経路では Prisma Adapter を使うため `src/server/auth.ts` で上書き定義する (本章記載の構造に置き換える)。
```


- [ ] **Step 7: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/stacks/t3-default.md
```

Expected: `OK`


- [ ] **Step 8: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/stacks/t3-default.md
git diff --cached --stat skills/anytime-build-webapp/stacks/t3-default.md
git commit -m "$(cat <<'EOF'
refactor(anytime-build-webapp): t3-default を _frontend-next.md 参照に整理

Next.js / Tailwind / scripts / src 共通部分は _frontend-next.md に集約済みなので、
t3-default は T3 固有差分 (tRPC + Prisma + Postgres + Dockerfile) のみ記述する形に
簡素化。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Phase B: Python BE テンプレファイル群作成


`scaffold/python-be-files/` に Phase 4 で展開されるテンプレファイル群を配置する。\
ファイル名末尾 `.tmpl` は「プレースホルダ `<project-name>` 等が含まれている雛形」の意味。Phase 4 で `sed` 置換して `.tmpl` を外して `backend/` 配下に配置される。


### Task 3: pyproject.toml.tmpl を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/pyproject.toml.tmpl`


- [ ] **Step 1: 親ディレクトリ作成**

```bash
mkdir -p /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app
mkdir -p /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic
ls -la /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/
```

Expected: `app/` と `alembic/` が表示される。


- [ ] **Step 2: ファイル新規作成 (Write tool)**

```toml
[project]
name = "<project-name>-backend"
version = "0.1.0"
description = "FastAPI backend for <project-name>"
requires-python = ">=3.13"
dependencies = [
    "fastapi[standard]>=0.115,<0.116",
    "sqlalchemy>=2.0,<2.1",
    "alembic>=1.13,<1.14",
    "psycopg[binary]>=3.2,<3.3",
    "python-jose[cryptography]>=3.3,<3.4",
    "pydantic-settings>=2.5,<3.0",
    "passlib[bcrypt]>=1.7,<2.0",
    "uvicorn[standard]>=0.32,<0.33",
]

[dependency-groups]
dev = [
    "pytest>=8.3,<9.0",
    "pytest-asyncio>=0.24,<0.25",
    "httpx>=0.27,<0.28",
    "ruff>=0.7,<0.8",
]

[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
pythonpath = ["."]
testpaths = ["tests"]
```


- [ ] **Step 3: TOML 構文検証 (プレースホルダのまま検証可能)**

```bash
python3 -c "import tomllib; tomllib.load(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/pyproject.toml.tmpl','rb'))"
```

Expected: 例外なし (戻り値なし)。`<project-name>` は文字列値内なので TOML パースは通る。


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/pyproject.toml.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 pyproject.toml.tmpl を追加

uv プロジェクト定義 (Python 3.13、FastAPI 0.115/SQLAlchemy 2.0/Alembic 1.13/
python-jose 3.3 等の依存) と ruff/pytest 設定。Phase 4.4 でプレースホルダ置換後に
backend/pyproject.toml として配置される。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 4: alembic.ini.tmpl を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic.ini.tmpl`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os
sqlalchemy.url = driver://user:pass@localhost/dbname

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

`sqlalchemy.url` の値は env.py 側で `DATABASE_URL` から動的に上書きされるためダミー値で OK。


- [ ] **Step 2: INI 構文検証**

```bash
python3 -c "import configparser; cp = configparser.ConfigParser(); cp.read('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic.ini.tmpl'); print(list(cp.sections()))"
```

Expected: `['alembic', 'loggers', 'handlers', 'formatters', 'logger_root', 'logger_sqlalchemy', 'logger_alembic', 'handler_console', 'formatter_generic']`


- [ ] **Step 3: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic.ini.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 alembic.ini.tmpl を追加

Alembic 設定ファイル。script_location は alembic/、sqlalchemy.url は env.py で
DATABASE_URL から動的設定するためダミー値。Phase 4.4 で backend/alembic.ini として配置。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 5: alembic/env.py.tmpl を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic/env.py.tmpl`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

```python
"""Alembic environment configuration for <project-name>."""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db import Base  # noqa: F401 — SQLAlchemy が metadata を見つけるために import
from app import models  # noqa: F401 — 全モデルを metadata に登録するために import

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```


- [ ] **Step 2: Python 構文検証 (プレースホルダは文字列内のため py_compile 可)**

```bash
python3 -c "import ast; ast.parse(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic/env.py.tmpl').read())"
```

Expected: 例外なし。


- [ ] **Step 3: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic/env.py.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 alembic/env.py.tmpl を追加

Alembic environment。app.db.Base + app.models を import して metadata を解決し、
DATABASE_URL 環境変数で sqlalchemy.url を上書き。offline/online 両モード対応。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 6: app/__init__.py.tmpl と app/db.py.tmpl を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/__init__.py.tmpl`
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/db.py.tmpl`


- [ ] **Step 1: __init__.py.tmpl 新規作成 (Write tool)**

```python
"""<project-name> backend application package."""
```


- [ ] **Step 2: db.py.tmpl 新規作成 (Write tool)**

```python
"""SQLAlchemy 2.0 engine and Session factory for <project-name>."""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative Base for all ORM models."""


def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure backend/.env with the Postgres connection string."
        )
    return url


engine = create_engine(_get_database_url(), pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy Session bound to the request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```


- [ ] **Step 3: Python 構文検証**

```bash
python3 -c "import ast; ast.parse(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/__init__.py.tmpl').read())"
python3 -c "import ast; ast.parse(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/db.py.tmpl').read())"
```

Expected: 例外なし (両方)。


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/app/__init__.py.tmpl \
        skills/anytime-build-webapp/scaffold/python-be-files/backend/app/db.py.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 app/__init__.py.tmpl と app/db.py.tmpl を追加

app/__init__.py.tmpl は空パッケージ宣言。app/db.py.tmpl は SQLAlchemy 2.0 の
DeclarativeBase + engine + SessionLocal + get_db 依存を定義。DATABASE_URL 未設定なら
起動失敗。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 7: app/deps.py.tmpl を新規作成 (JWT 検証)


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/deps.py.tmpl`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

```python
"""FastAPI dependencies: JWT validation for <project-name>.

Q3 = 無し のケースでは本ファイルは Phase 4.4 で生成されない。
Q3 = メールパスワード / Google OAuth のケースでのみ配置される。
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

bearer_scheme = HTTPBearer(auto_error=True)


def _get_auth_secret() -> str:
    secret = os.environ.get("AUTH_SECRET")
    if not secret:
        raise RuntimeError(
            "AUTH_SECRET is not set. Share the secret with Auth.js via backend/.env."
        )
    return secret


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Decode the HS256 JWT issued by Auth.js and return its claims."""
    try:
        payload = jwt.decode(creds.credentials, _get_auth_secret(), algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return payload
```


- [ ] **Step 2: Python 構文検証**

```bash
python3 -c "import ast; ast.parse(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/deps.py.tmpl').read())"
```

Expected: 例外なし。


- [ ] **Step 3: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/app/deps.py.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 app/deps.py.tmpl を追加

Auth.js (NextAuth v5) が発行する HS256 JWT を python-jose で検証する FastAPI
依存。Q3 = 無し のときは Phase 4.4 で生成されない。AUTH_SECRET 未設定なら起動失敗。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 8: app/main.py.tmpl を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/main.py.tmpl`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

```python
"""FastAPI entry point for <project-name>."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="<project-name> API", version="0.1.0")


def _cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["health"])
def healthz() -> dict[str, str]:
    """Liveness probe used by anytime-build-webapp Phase 6 verification."""
    return {"status": "ok"}


# Q2 エンティティのルータは Phase 5 (executing-plans) で app.include_router 経由で追加される
# 例: from app.routers.stock import router as stock_router
#     app.include_router(stock_router, prefix="/api", tags=["stock"])
```


- [ ] **Step 2: Python 構文検証**

```bash
python3 -c "import ast; ast.parse(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/main.py.tmpl').read())"
```

Expected: 例外なし。


- [ ] **Step 3: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/python-be-files/backend/app/main.py.tmpl
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 app/main.py.tmpl を追加

FastAPI app 初期化 + /healthz エンドポイント + CORSMiddleware
(CORS_ALLOWED_ORIGINS 環境変数駆動)。Q2 エンティティのルータは Phase 5 で
include_router 経由で追加される (本テンプレにはコメントで例示のみ)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Phase C: Python BE スタック定義


テンプレ群を呼び出すスキル側のスタック定義と rename map を作成する。


### Task 9: scaffold/rename-map-python-be.json を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/scaffold/rename-map-python-be.json`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

```json
{
  "$schema": "https://json.schemastore.org/anytime-build-webapp-rename-map.json",
  "description": "Python BE (FastAPI) 経路の rename map。anytime-lab クローン後の置換に加え、backend/ 配下のテンプレファイルから .tmpl を外して配置する。",
  "replacements": [
    { "find": "anytime-lab", "replace": "<project-name>" },
    { "find": "<project-name>", "replace": "<project-name>" }
  ],
  "targets": [
    "package.json",
    "docker-compose.yml",
    ".devcontainer/devcontainer.json",
    "README.md",
    "backend/pyproject.toml",
    "backend/alembic.ini",
    "backend/alembic/env.py",
    "backend/app/__init__.py",
    "backend/app/db.py",
    "backend/app/deps.py",
    "backend/app/main.py"
  ],
  "inPlaceExcludes": [
    ".devcontainer/devcontainer.json"
  ],
  "validations": [
    {
      "file": "package.json",
      "jsonpath": "$.name",
      "expected": "<project-name>"
    },
    {
      "file": "backend/pyproject.toml",
      "regex": "name = \"<project-name>-backend\"",
      "expected": "match"
    },
    {
      "file": "backend/app/main.py",
      "regex": "title=\"<project-name> API\"",
      "expected": "match"
    }
  ]
}
```


- [ ] **Step 2: JSON 構文検証**

```bash
jq -e . /home/user/.claude/skills/anytime-build-webapp/scaffold/rename-map-python-be.json > /dev/null
echo "exit=$?"
```

Expected: `exit=0`


- [ ] **Step 3: 中身の sanity check**

```bash
jq -r '.targets | length, .validations | length' /home/user/.claude/skills/anytime-build-webapp/scaffold/rename-map-python-be.json
```

Expected: 11 (targets 数) と 3 (validations 数)。


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/scaffold/rename-map-python-be.json
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): Python BE 用 rename-map-python-be.json を追加

anytime-lab クローン後の置換対象に backend/ 配下のテンプレ展開済みファイルを追加。
backend/pyproject.toml の name フィールドと backend/app/main.py の title 文字列を
validation 対象にし、置換漏れを Phase 4.3 で検出可能にする。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 10: stacks/python-be.md を新規作成


**Files:**
- Create: `/home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md`


- [ ] **Step 1: ファイル新規作成 (Write tool)**

````markdown
# Python BE (FastAPI) スタック構成

`anytime-lab` クローン + リネーム後に重ね合わせる Next.js + FastAPI 構成定義。

> [!IMPORTANT]
> フロントエンド共通部分 (Next.js / Tailwind / Auth.js / @hey-api/openapi-ts) は\
> **`stacks/_frontend-next.md`** に集約済み。本ファイルは Python BE 固有の差分のみを記述する。


## 0. 前提とディレクトリ構成

Phase 4 で以下のディレクトリ構造を作成する。

```text
<project-root>/
├── frontend/        # Next.js (_frontend-next.md 適用先)
├── backend/         # FastAPI (本ファイル適用先)
├── docker-compose.yml
└── .devcontainer/   # 既存温存 (in-place モード)
```

`_frontend-next.md` 第 1〜8 章は `frontend/` ディレクトリで適用する。\
本ファイル第 1 章以降は `backend/` ディレクトリで適用する。


## 1. 追加するパッケージ (uv 経由)

`scaffold/python-be-files/backend/pyproject.toml.tmpl` を `backend/pyproject.toml` に配置 (rename-map-python-be.json の対象)。\
その後、`backend/` で `uv venv && uv sync` を実行 (Phase 6.1)。

主要依存:

| パッケージ | バージョン | 用途 |
| --- | --- | --- |
| fastapi[standard] | `^0.115` | Web フレームワーク |
| sqlalchemy | `^2.0` | ORM |
| alembic | `^1.13` | DB マイグレーション |
| psycopg[binary] | `^3.2` | Postgres ドライバ |
| python-jose[cryptography] | `^3.3` | JWT 検証 (Q3 = 無し以外で使用) |
| pydantic-settings | `^2.5` | 環境変数管理 |
| passlib[bcrypt] | `^1.7` | パスワードハッシュ (Q3 = メールパスワード) |
| uvicorn[standard] | `^0.32` | ASGI サーバ |
| ruff | `^0.7` | リンタ + フォーマッタ (dev) |
| pytest | `^8.3` | テスト (dev) |
| httpx | `^0.27` | テスト用 HTTP クライアント (dev) |


## 2. テンプレファイルの配置

`scaffold/python-be-files/backend/` 配下の `.tmpl` ファイルを `backend/` に展開する。\
配置時に `.tmpl` 拡張子を外し、`<project-name>` を実プロジェクト名に置換する (rename-map-python-be.json 経由)。

| 元ファイル | 配置先 |
| --- | --- |
| `pyproject.toml.tmpl` | `backend/pyproject.toml` |
| `alembic.ini.tmpl` | `backend/alembic.ini` |
| `alembic/env.py.tmpl` | `backend/alembic/env.py` |
| `app/__init__.py.tmpl` | `backend/app/__init__.py` |
| `app/db.py.tmpl` | `backend/app/db.py` |
| `app/deps.py.tmpl` | `backend/app/deps.py` (Q3 = 無し以外) |
| `app/main.py.tmpl` | `backend/app/main.py` |


## 3. SQLAlchemy モデルの動的生成 (Q2 エンティティ)

Phase 4.5 で `q2_entities` から `backend/app/models/<entity>.py` を生成する。

例: Q2 = `Stock, Price, Indicator` の場合、`backend/app/models/stock.py`:

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base


class Stock(Base):
    __tablename__ = "stocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

> [!NOTE]
> リレーションは Phase 2 (writing-plans) の中で `executing-plans` に判断を委ねる。\
> 本ファイルでは「最小カラム (`id` / `name` / `created_at`) のみ生成する初期テンプレ」とする。

`backend/app/models/__init__.py` に各モデルを import する:

```python
from app.models.stock import Stock as Stock
from app.models.price import Price as Price
from app.models.indicator import Indicator as Indicator
```


## 4. 初期 Alembic revision の生成

Phase 4.5 の最後で以下を実行。

```bash
cd backend
uv run alembic revision --autogenerate -m "init"
```

`backend/alembic/versions/<hash>_init.py` が生成される。Phase 6.3 で `uv run alembic upgrade head` を実行。


## 5. docker-compose.yml への追加

`docker-compose.yml` の `services:` セクションに `api` を追加。\
`db` サービスは `_frontend-next.md` で扱われないため、本ファイルで提供する。

```yaml
services:
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

  api:
    image: python:3.13-slim
    working_dir: /workspace/backend
    command: bash -c "pip install -e . && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app
      AUTH_SECRET: ${AUTH_SECRET:-}
      CORS_ALLOWED_ORIGINS: http://localhost:3000
    ports:
      - "8000:8000"
    volumes:
      - ./:/workspace
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

`app` (frontend) サービスの `environment:` に追加:

```yaml
      NEXT_PUBLIC_API_BASE_URL: http://localhost:8000
      AUTH_SECRET: ${AUTH_SECRET:-}
      NEXTAUTH_URL: http://localhost:3000
```


## 6. .env ファイル

`frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
AUTH_SECRET=<openssl rand -base64 32 で生成>
NEXTAUTH_URL=http://localhost:3000
```

`backend/.env`:

```dotenv
DATABASE_URL=postgres://app:app@localhost:5432/app
AUTH_SECRET=<frontend/.env.local と同じ値>
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Phase 4.7 で `openssl rand -base64 32` を 1 回実行し、両ファイルの `AUTH_SECRET` に同じ値を書き込む。

> [!IMPORTANT]
> Q3 = 無し のときは `AUTH_SECRET` の生成・書き込みを **スキップ**する。\
> Phase 4.4 で `app/deps.py.tmpl` も配置しない。


## 7. OpenAPI → TS クライアント生成

Phase 4.8 で `frontend/openapi-ts.config.ts` を `_frontend-next.md` 第 5 章のテンプレで配置する。\
backend を一時起動して `/openapi.json` を fetch、`@hey-api/openapi-ts` で `frontend/src/api/` に TS クライアントを生成。

### 7.1. in-place モード

```bash
cd backend
nohup uv run uvicorn app.main:app --port 8000 > /tmp/uvicorn-bootstrap.log 2>&1 &
BE_PID=$!
trap "kill ${BE_PID} 2>/dev/null" EXIT

timeout 30 bash -c 'until curl -sf http://localhost:8000/openapi.json > /dev/null; do sleep 1; done'
curl -sf http://localhost:8000/openapi.json -o ../frontend/openapi.json

cd ../frontend
OPENAPI_URL="./openapi.json" npm run gen:api

kill ${BE_PID}
```

### 7.2. --new-dir モード

```bash
docker compose up -d api
timeout 60 bash -c 'until curl -sf http://localhost:8000/openapi.json > /dev/null; do sleep 2; done'
curl -sf http://localhost:8000/openapi.json -o frontend/openapi.json
docker compose stop api

(cd frontend && OPENAPI_URL="./openapi.json" npm run gen:api)
```


## 8. 完了条件

Phase 4 完了時、以下を全て満たすこと。

- `backend/pyproject.toml` が `<project-name>-backend` で生成される
- `backend/alembic.ini` / `backend/alembic/env.py` / `backend/app/main.py` / `backend/app/db.py` が存在
- Q3 = 無し以外なら `backend/app/deps.py` が存在
- `backend/app/models/<entity>.py` が Q2 エンティティごとに生成される
- `backend/alembic/versions/<hash>_init.py` が生成される
- `frontend/openapi-ts.config.ts` が生成される
- `frontend/.env.local` と `backend/.env` が AUTH_SECRET を共有 (Q3 = 無し以外)
- `docker-compose.yml` に `api` サービスと `db` サービスが定義される
````


- [ ] **Step 2: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md
```

Expected: `OK`


- [ ] **Step 3: 自己リンク (内部参照) 整合性確認**

```bash
grep -n "_frontend-next.md" /home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md
grep -n "python-be-files" /home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md
```

Expected: 複数行ヒット (前者は数件、後者は 1 行)。


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/stacks/python-be.md
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): stacks/python-be.md を追加

Next.js + FastAPI スタック定義。frontend/ + backend/ 並列配置、SQLAlchemy 2.0 +
Alembic、Auth.js + JWT 検証、@hey-api/openapi-ts での型自動生成を構成。
_frontend-next.md を参照、Python BE 固有部分のみ記述。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Phase D: スキル orchestrator 更新


SKILL.md と meta ファイル群を更新し、Q4 = Python BE が動作する状態にする。


### Task 11: stacks/overrides.md の判定マトリクス更新


**Files:**
- Modify: `/home/user/.claude/skills/anytime-build-webapp/stacks/overrides.md`


- [ ] **Step 1: 判定マトリクス更新 (Edit tool)**

`old_string`:

```text
| Q4 回答 | 分岐先 | 適用変更 | 初期リリース対応 |
| --- | --- | --- | --- |
| 無し / `T3 で` | `stacks/t3-default.md` | 変更無し | ◯ |
| `Python BE で` | `stacks/python-be.md`（将来） | tRPC を FastAPI に差し替え、Python サービスを compose 追加 | × 未対応 |
| `Hono BE で` | `stacks/hono-be.md`（将来） | tRPC を Hono REST に差し替え | × 未対応 |
| `Rails で` | `stacks/rails-hotwire.md`（将来） | T3 全体を Rails + Hotwire に差し替え | × 未対応 |
| その他 | T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 | ◯ |
```

`new_string`:

```text
| Q4 回答 | 分岐先 | 適用変更 | 初期リリース対応 |
| --- | --- | --- | --- |
| 無し / `T3 で` | `stacks/t3-default.md` + `stacks/_frontend-next.md` | 変更無し | ◯ |
| `Python BE で` | `stacks/python-be.md` + `stacks/_frontend-next.md` | frontend/ + backend/ 並列、FastAPI + SQLAlchemy + Alembic、Auth.js + JWT 検証、OpenAPI 自動生成 | ◯ |
| `Hono BE で` | `stacks/hono-be.md`（将来） | tRPC を Hono REST に差し替え | × 未対応 |
| `Rails で` | `stacks/rails-hotwire.md`（将来） | T3 全体を Rails + Hotwire に差し替え | × 未対応 |
| その他 | T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 | ◯ |
```


- [ ] **Step 2: 第 2 章 YAGNI 記述から python-be を除外 (Edit tool)**

`old_string`:

```text
## 2. 初期リリースの方針（YAGNI）

本リリースでは `t3-default` のみを実装する。\
`python-be` / `hono-be` / `rails-hotwire` は使用実績が出てから追加する。

未対応スタックを Q4 で選んだ場合は SKILL.md の Phase 1.5 で以下のメッセージを出してユーザに確認する。
```

`new_string`:

```text
## 2. 初期リリースの方針（YAGNI）

本リリースでは `t3-default` と `python-be` を実装する。\
`hono-be` / `rails-hotwire` は使用実績が出てから追加する。

未対応スタックを Q4 で選んだ場合は SKILL.md の Phase 1.5 で以下のメッセージを出してユーザに確認する。
```


- [ ] **Step 3: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/stacks/overrides.md
```

Expected: `OK`


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/stacks/overrides.md
git commit -m "$(cat <<'EOF'
docs(anytime-build-webapp): overrides.md 判定マトリクスを Python BE 対応に更新

Python BE を「◯ 対応」に昇格、分岐先に python-be.md + _frontend-next.md を併記。
YAGNI 記述から python-be を除外。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 12: SKILL.md に Phase 1.5 / 4 / 6 分岐を追加


**Files:**
- Modify: `/home/user/.claude/skills/anytime-build-webapp/SKILL.md`


- [ ] **Step 1: Phase 1.5 修正 (Edit tool) — Python BE を対応スタックに昇格**

`old_string`:

```text
### Phase 1.5: 未対応スタックの確認


Q4 が `Python BE` / `Hono BE` / `その他` の場合、`stacks/overrides.md` 第 2 章のメッセージで `AskUserQuestion` を 1 回追加。

- `T3 デフォルトで進める` → Q4 を「無し」に上書きして続行
- `中断する` → Phase 1 で停止し、対応スタック追加リクエストとしてユーザに通知
```

`new_string`:

```text
### Phase 1.5: 未対応スタックの確認


Q4 が `Hono BE` / `その他` の場合、`stacks/overrides.md` 第 2 章のメッセージで `AskUserQuestion` を 1 回追加。

- `T3 デフォルトで進める` → Q4 を「無し」に上書きして続行
- `中断する` → Phase 1 で停止し、対応スタック追加リクエストとしてユーザに通知

Q4 が `Python BE` の場合は確認なしで `stacks/python-be.md` 経路へ進む（初期リリースで対応済み）。
```


- [ ] **Step 2: Phase 2 の渡しコンテキスト更新 (Edit tool)**

`old_string`:

```text
## Phase 2: Plan


1. **`Skill` ツールで `superpowers:writing-plans` を起動**する
2. 渡すコンテキスト:
   - `requirements.md`（CWD のもの）
   - `.claude/skills/anytime-build-webapp/stacks/t3-default.md`（Q4 = 無しの場合）
   - `.claude/skills/anytime-build-webapp/scaffold/base-repo.md`
3. `writing-plans` が生成したプラン（通常 `docs/superpowers/plans/<date>-<topic>.md`）のパスを保持
```

`new_string`:

```text
## Phase 2: Plan


1. **`Skill` ツールで `superpowers:writing-plans` を起動**する
2. 渡すコンテキスト (Q4 で分岐):
   - 共通: `requirements.md`（CWD のもの）・`.claude/skills/anytime-build-webapp/scaffold/base-repo.md`・`.claude/skills/anytime-build-webapp/stacks/_frontend-next.md`
   - Q4 = 無し: `.claude/skills/anytime-build-webapp/stacks/t3-default.md`
   - Q4 = Python BE: `.claude/skills/anytime-build-webapp/stacks/python-be.md`
3. `writing-plans` が生成したプラン（通常 `docs/superpowers/plans/<date>-<topic>.md`）のパスを保持
```


- [ ] **Step 3: Phase 4.4 を Q4 分岐に書き換え (Edit tool)**

`old_string`:

```text
### 4.4. T3 重ね合わせ

`stacks/t3-default.md` 第 1〜8 章の指示に従って T3 構成を重ね合わせる。

1. パッケージインストール（第 1 章）
2. `package.json` scripts 追記（第 2 章）
3. Prisma 初期化 + schema 上書き（第 3 章）— Q2 エンティティを末尾に追加
4. Tailwind 初期化 + 設定上書き（第 4 章）
5. `docker-compose.yml` に Postgres + volumes 追記（第 5 章）
6. `Dockerfile` に postgres-client + Prisma CLI 追記（第 6 章）
7. `.devcontainer/devcontainer.json` 修正（第 7 章）— **in-place モードではスキップ**（現状温存）
8. `src/` ディレクトリ構造作成（第 8 章）
```

`new_string`:

```text
### 4.4. スタック重ね合わせ (Q4 分岐)


#### 4.4.a. Q4 = 無し (T3 経路)

`stacks/_frontend-next.md` 第 1〜8 章を適用後、`stacks/t3-default.md` 第 1〜8 章を重ね合わせる。

1. `_frontend-next.md` 第 1 章 + `t3-default.md` 第 1 章 (T3 固有パッケージ追加)
2. `_frontend-next.md` 第 2 章 + `t3-default.md` 第 2 章 (Prisma scripts 追記)
3. `t3-default.md` 第 3 章 (Prisma 初期化 + schema 上書き) — Q2 エンティティを末尾に追加
4. `_frontend-next.md` 第 3 章 (Tailwind 設定)
5. `t3-default.md` 第 5 章 (`docker-compose.yml` に Postgres + volumes 追記)
6. `t3-default.md` 第 6 章 (`Dockerfile` に postgres-client + Prisma CLI 追記)
7. `t3-default.md` 第 7 章 (`.devcontainer/devcontainer.json` 修正) — **in-place モードではスキップ**
8. `_frontend-next.md` 第 6 章 + `t3-default.md` 第 8 章 (`src/` ディレクトリ構造)


#### 4.4.b. Q4 = Python BE 経路

1. `frontend/` と `backend/` のディレクトリを作成
2. `frontend/` で `_frontend-next.md` 第 1〜8 章を適用
3. `backend/` に `scaffold/python-be-files/backend/` 配下のテンプレを `cp -r` で配置
4. `scaffold/rename-map-python-be.json` を `_frontend-next.md` 適用後に再度適用 (`.tmpl` 拡張子の除去 + `<project-name>` 置換)
5. Q2 エンティティから `backend/app/models/<entity>.py` を生成 (`python-be.md` 第 3 章)
6. `backend/app/models/__init__.py` に各モデルを集約
7. Q3 = 無し のときは `backend/app/deps.py` を削除
8. `docker-compose.yml` に `api` + `db` サービスを追加 (`python-be.md` 第 5 章)
9. `frontend/.env.local` + `backend/.env` を生成 (`python-be.md` 第 6 章)。Q3 = 無し以外なら `openssl rand -base64 32` で AUTH_SECRET を生成し両 .env に書き込み
10. `backend` で `uv venv && uv sync` 実行 → `uv run alembic revision --autogenerate -m "init"` で初期 revision 生成
11. `python-be.md` 第 7 章に従い backend 一時起動 + OpenAPI fetch + `frontend/src/api/` に TS クライアント生成
```


- [ ] **Step 4: Phase 4.5 (初期 commit) のメッセージを Q4 分岐 (Edit tool)**

`old_string`:

```text
### 4.5. 初期 git commit

#### in-place モード（デフォルト）

```bash
# CWD で実行
git init
git add .
git commit -m "chore: initial scaffold from anytime-lab + T3 Stack"
```

#### --new-dir モード

```bash
cd <project-name>
git init
git add .
git commit -m "chore: initial scaffold from anytime-lab + T3 Stack"
```

push は行わない。
```

`new_string`:

```text
### 4.5. 初期 git commit

commit メッセージは Q4 で分岐する。

- Q4 = 無し: `chore: initial scaffold from anytime-lab + T3 Stack`
- Q4 = Python BE: `chore: initial scaffold from anytime-lab + Next.js + FastAPI`

#### in-place モード（デフォルト）

```bash
# CWD で実行
git init
git add .
git commit -m "<上記の Q4 別メッセージ>"
```

#### --new-dir モード

```bash
cd <project-name>
git init
git add .
git commit -m "<上記の Q4 別メッセージ>"
```

push は行わない。
```


- [ ] **Step 5: Phase 6 (in-place) に backend healthz 検証を追加 (Edit tool)**

`old_string`:

```text
### in-place モード

Docker は使えない前提（Dev Container 内で実行中）。直接 npm を使う。

#### 6.1. 依存解決

```bash
npm install
```
```

`new_string`:

```text
### in-place モード

Docker は使えない前提（Dev Container 内で実行中）。直接 npm / uv を使う。\
手順は Q4 で分岐する。


#### Q4 = 無し (T3 経路) の手順

##### 6.1.a. 依存解決

```bash
npm install
```
```


- [ ] **Step 6: Phase 6 (in-place) の Q4 = Python BE 経路を追加 (Edit tool) — 6.5 完了通知の直後に追記**

`old_string`:

```text
#### 6.5. 完了通知（in-place）

```text
[anytime-build-webapp] 完了（in-place モード）
- プロジェクトルート: <CWD>
- プロジェクト名: <PROJECT_NAME>
- ベース: anytime-trial/anytime-lab
- スタック: T3 (Next.js + tRPC + Prisma + Tailwind + NextAuth)
- 起動状態: http://localhost:<APP_PORT> (HTTP 200 確認済み)

次の手順:
1. ブラウザで http://localhost:<APP_PORT> を開いてください
2. Postgres は別途用意してください（既存 .devcontainer は Postgres 未統合）
   - 一時的: `docker compose up -d db` を WSL ホストで実行
   - 永続化: .devcontainer/devcontainer.json を docker-compose 連携に書き換え
3. .env の DATABASE_URL を確認し、`npx prisma migrate dev --name init` を実行
```


### --new-dir モード
```

`new_string`:

```text
#### 6.5. 完了通知（in-place / T3）

```text
[anytime-build-webapp] 完了（in-place モード）
- プロジェクトルート: <CWD>
- プロジェクト名: <PROJECT_NAME>
- ベース: anytime-trial/anytime-lab
- スタック: T3 (Next.js + tRPC + Prisma + Tailwind + NextAuth)
- 起動状態: http://localhost:<APP_PORT> (HTTP 200 確認済み)

次の手順:
1. ブラウザで http://localhost:<APP_PORT> を開いてください
2. Postgres は別途用意してください（既存 .devcontainer は Postgres 未統合）
   - 一時的: `docker compose up -d db` を WSL ホストで実行
   - 永続化: .devcontainer/devcontainer.json を docker-compose 連携に書き換え
3. .env の DATABASE_URL を確認し、`npx prisma migrate dev --name init` を実行
```


#### Q4 = Python BE 経路の手順

##### 6.1.b. 依存解決 (frontend + backend)

```bash
(cd frontend && npm install)
(cd backend && uv venv && uv sync)
```

##### 6.2.b. DB マイグレーション

```bash
(cd backend && uv run alembic upgrade head)
```

##### 6.3.b. backend 起動

```bash
(cd backend && nohup uv run uvicorn app.main:app --port 8000 > /tmp/uvicorn-server.log 2>&1 &)
echo $! > /tmp/uvicorn-server.pid
timeout 60 bash -c 'until curl -sf http://localhost:8000/healthz > /dev/null; do sleep 2; done'
```

##### 6.4.b. backend 疎通確認

```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:8000/healthz
```

期待: `200`。それ以外なら `/tmp/uvicorn-server.log` をダンプ。

##### 6.5.b. OpenAPI 再生成 (整合性確認)

```bash
(cd frontend && OPENAPI_URL="http://localhost:8000/openapi.json" npm run gen:api)
(cd frontend && git diff --exit-code src/api/) && echo "型整合 OK" || echo "WARN: BE-FE 型ずれ"
```

##### 6.6.b. frontend 起動 + 疎通確認

```bash
(cd frontend && APP_PORT=${APP_PORT:-3000} npm run dev &)
timeout 60 bash -c "until curl -sf http://localhost:\$APP_PORT > /dev/null; do sleep 2; done"
curl -sS -o /dev/null -w "%{http_code}" http://localhost:${APP_PORT}
```

期待: `200`

##### 6.7.b. テスト実行

```bash
(cd backend && uv run pytest) || echo "WARN: backend tests failed"
(cd frontend && npm test) || echo "WARN: frontend tests failed"
```

##### 6.8.b. 完了通知（in-place / Python BE）

```text
[anytime-build-webapp] 完了（in-place モード / Python BE）
- プロジェクトルート: <CWD>
- プロジェクト名: <PROJECT_NAME>
- ベース: anytime-trial/anytime-lab
- スタック: Next.js (frontend/) + FastAPI (backend/) + SQLAlchemy + Alembic
- 起動状態:
  - frontend: http://localhost:<APP_PORT> (HTTP 200)
  - backend:  http://localhost:8000/healthz (HTTP 200)
- 型共有: OpenAPI → frontend/src/api/ (npm run gen:api で再生成)

次の手順:
1. ブラウザで http://localhost:<APP_PORT> を開いてください
2. backend 開発時は別ターミナルで:
   (cd backend && uv run uvicorn app.main:app --reload --port 8000)
3. スキーマ変更時:
   (cd backend && uv run alembic revision --autogenerate -m "<msg>")
   (cd backend && uv run alembic upgrade head)
   (cd frontend && OPENAPI_URL="http://localhost:8000/openapi.json" npm run gen:api)
```


### --new-dir モード
```


- [ ] **Step 7: 参照ファイル一覧を更新 (Edit tool)**

`old_string`:

```text
| ファイル | 用途 |
| --- | --- |
| `.claude/skills/anytime-build-webapp/DESIGN.ja.md` | 設計書（仕様の正） |
| `.claude/skills/anytime-build-webapp/questions.md` | 5 問インタビュー定義 |
| `.claude/skills/anytime-build-webapp/requirements-template.md` | 要件 md テンプレ |
| `.claude/skills/anytime-build-webapp/stacks/t3-default.md` | T3 重ね合わせ手順 |
| `.claude/skills/anytime-build-webapp/stacks/overrides.md` | スタック上書き判定 |
| `.claude/skills/anytime-build-webapp/scaffold/base-repo.md` | `anytime-lab` クローン手順 |
| `.claude/skills/anytime-build-webapp/scaffold/rename-map.json` | リネーム置換マップ |
```

`new_string`:

```text
| ファイル | 用途 |
| --- | --- |
| `.claude/skills/anytime-build-webapp/DESIGN.ja.md` | 設計書（仕様の正） |
| `.claude/skills/anytime-build-webapp/DESIGN.python-be.ja.md` | Python BE 拡張設計書 |
| `.claude/skills/anytime-build-webapp/questions.md` | 5 問インタビュー定義 |
| `.claude/skills/anytime-build-webapp/requirements-template.md` | 要件 md テンプレ |
| `.claude/skills/anytime-build-webapp/stacks/_frontend-next.md` | フロント共通 (Next.js + Tailwind + Auth.js + openapi-ts) |
| `.claude/skills/anytime-build-webapp/stacks/t3-default.md` | T3 重ね合わせ手順 (固有差分のみ) |
| `.claude/skills/anytime-build-webapp/stacks/python-be.md` | Python BE (FastAPI) スタック手順 |
| `.claude/skills/anytime-build-webapp/stacks/overrides.md` | スタック上書き判定 |
| `.claude/skills/anytime-build-webapp/scaffold/base-repo.md` | `anytime-lab` クローン手順 |
| `.claude/skills/anytime-build-webapp/scaffold/rename-map.json` | T3 用リネーム置換マップ |
| `.claude/skills/anytime-build-webapp/scaffold/rename-map-python-be.json` | Python BE 用リネーム置換マップ |
| `.claude/skills/anytime-build-webapp/scaffold/python-be-files/` | Python BE テンプレファイル群 |
```


- [ ] **Step 8: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/SKILL.md
```

Expected: `OK`


- [ ] **Step 9: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/SKILL.md
git commit -m "$(cat <<'EOF'
feat(anytime-build-webapp): SKILL.md に Python BE 経路を統合

Phase 1.5 で Python BE を確認スキップ、Phase 2 で writing-plans に渡すコンテキストを
Q4 分岐、Phase 4.4 を T3 / Python BE 両経路の重ね合わせ手順に書き換え、Phase 6 in-place
モードに Python BE 経路 (backend healthz、OpenAPI 再生成、frontend 疎通) を追記。
参照ファイル一覧も更新。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 13: requirements-template.md の Q4 出し分けと完了条件追記


**Files:**
- Modify: `/home/user/.claude/skills/anytime-build-webapp/requirements-template.md`


- [ ] **Step 1: 完了条件セクションを Q4 経路別に書き換え (Edit tool)**

`old_string`:

```text
## 6. 完了条件

- [ ] Dev Container build が成功する
- [ ] `npm install` が成功する
- [ ] `npx prisma migrate dev --name init` が成功する
- [ ] `npm run dev` が起動し、WSL ホストブラウザで `http://localhost:3000` が表示される
- [ ] 全エンティティの一覧画面が空状態で表示される
- [ ] `npm run lint` が通る
- [ ] `npm test` が通る（最小スモークテスト）
```

`new_string`:

```text
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
```


- [ ] **Step 2: プレースホルダ表に Q4_STACK_NAME のマッピングを追加 (Edit tool)**

`old_string`:

```text
| `{{Q4_STACK_NAME}}` | `T3 Stack` 等 | Q4 + `stacks/*.md` | ◯ |
| `{{Q4_STACK_DETAIL}}` | 該当 stacks/*.md を引用 | Q4 | ◯ |
```

`new_string`:

```text
| `{{Q4_STACK_NAME}}` | `T3 Stack` または `Next.js + FastAPI (Python BE)` | Q4 + `stacks/*.md` | ◯ |
| `{{Q4_STACK_DETAIL}}` | 該当 stacks/*.md を引用 (T3 経路: `_frontend-next.md` + `t3-default.md` / Python BE 経路: `_frontend-next.md` + `python-be.md`) | Q4 | ◯ |
```


- [ ] **Step 3: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/requirements-template.md
```

Expected: `OK`


- [ ] **Step 4: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/requirements-template.md
git commit -m "$(cat <<'EOF'
docs(anytime-build-webapp): requirements-template に Python BE 完了条件を追記

完了条件を T3 経路と Python BE 経路の 2 セットに分離。プレースホルダ表に
Q4_STACK_NAME と Q4_STACK_DETAIL の Python BE 経路マッピングを追加。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


### Task 14: DESIGN.ja.md の判定マトリクスと将来拡張を更新


**Files:**
- Modify: `/home/user/.claude/skills/anytime-build-webapp/DESIGN.ja.md`


- [ ] **Step 1: 第 8.1 章判定マトリクスを更新 (Edit tool)**

`old_string`:

```text
| Q4 回答 | 分岐先 | 適用変更 |
| --- | --- | --- |
| 無し | `stacks/t3-default.md` | 変更無し |
| `Python BE` | `stacks/python-be.md`（将来追加） | tRPC を FastAPI に差し替え、`docker-compose.yml` に Python サービス追加 |
| `Hono BE` | `stacks/hono-be.md`（将来追加） | tRPC を Hono REST に差し替え |
| その他 | 警告して T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 |
```

`new_string`:

```text
| Q4 回答 | 分岐先 | 適用変更 |
| --- | --- | --- |
| 無し | `stacks/t3-default.md` + `stacks/_frontend-next.md` | 変更無し |
| `Python BE` | `stacks/python-be.md` + `stacks/_frontend-next.md` | frontend/ + backend/ 並列、FastAPI + SQLAlchemy + Alembic、Auth.js + JWT 検証 (詳細は `DESIGN.python-be.ja.md`) |
| `Hono BE` | `stacks/hono-be.md`（将来追加） | tRPC を Hono REST に差し替え |
| その他 | 警告して T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 |
```


- [ ] **Step 2: 第 8.2 章初期リリース範囲を更新 (Edit tool)**

`old_string`:

```text
### 8.2. 初期リリース範囲


本設計の初期リリースでは `t3-default` のみ実装する。`python-be` / `hono-be` は使用実績が出てから追加する（YAGNI）。
```

`new_string`:

```text
### 8.2. 初期リリース範囲


本設計の初期リリースでは `t3-default` と `python-be` を実装する。`hono-be` は使用実績が出てから追加する（YAGNI）。\
`python-be` の詳細は `DESIGN.python-be.ja.md` を参照。
```


- [ ] **Step 3: 第 12 章将来拡張から python-be を削除 (Edit tool)**

`old_string`:

```text
## 12. 将来拡張


本リリースには含めないが、設計上余地を残す項目。

- スタック追加（`python-be` / `hono-be` / `rails-hotwire`）
- デプロイ自動化（`vercel deploy` / `wrangler deploy`）まで Phase 7 として追加
- 既存リポジトリへの追加機能生成（新規プロジェクトでなく `add-feature` モード）
- 多言語化（質問・出力を英語切替）
```

`new_string`:

```text
## 12. 将来拡張


本リリースには含めないが、設計上余地を残す項目。

- スタック追加（`hono-be` / `rails-hotwire`）。`python-be` は対応済み (`DESIGN.python-be.ja.md` 参照)
- デプロイ自動化（`vercel deploy` / `wrangler deploy`）まで Phase 7 として追加
- 既存リポジトリへの追加機能生成（新規プロジェクトでなく `add-feature` モード）
- 多言語化（質問・出力を英語切替）
```


- [ ] **Step 4: 第 3 章ファイル構成図を更新 (Edit tool)**

`old_string`:

```text
```text
.claude/skills/anytime-build-webapp/
├── SKILL.md                    # メインスキル (YAML frontmatter + 手順本文)
├── DESIGN.ja.md                # 本設計書
├── questions.md                # 5 問インタビュー定義
├── requirements-template.md    # writing-plans に渡す要件 md のテンプレ
├── stacks/
│   ├── t3-default.md           # デフォルト T3 + Postgres 構成定義（anytime-lab 重ね合わせ前提）
│   └── overrides.md            # 「Python BE で」等の上書き分岐ルール
└── scaffold/
    ├── base-repo.md            # ベースリポ仕様（クローン元・リネーム規則）
    └── rename-map.json         # 文字列置換マップ（anytime-lab → <project-name>）
```
```

`new_string`:

```text
```text
.claude/skills/anytime-build-webapp/
├── SKILL.md                    # メインスキル (YAML frontmatter + 手順本文)
├── DESIGN.ja.md                # 本設計書
├── DESIGN.python-be.ja.md      # Python BE 拡張設計書
├── questions.md                # 5 問インタビュー定義
├── requirements-template.md    # writing-plans に渡す要件 md のテンプレ
├── stacks/
│   ├── _frontend-next.md       # フロント共通 (Next.js + Tailwind + Auth.js + openapi-ts)
│   ├── t3-default.md           # T3 固有差分 (tRPC + Prisma + Postgres + Dockerfile)
│   ├── python-be.md            # Python BE (FastAPI + SQLAlchemy + Alembic)
│   └── overrides.md            # 「Python BE で」等の上書き分岐ルール
└── scaffold/
    ├── base-repo.md            # ベースリポ仕様（クローン元・リネーム規則）
    ├── rename-map.json         # T3 用文字列置換マップ
    ├── rename-map-python-be.json # Python BE 用文字列置換マップ
    └── python-be-files/        # Python BE テンプレファイル群 (backend/*.tmpl)
```
```


- [ ] **Step 5: Markdown 検証**

```bash
bash ~/.claude/scripts/validate-markdown.sh /home/user/.claude/skills/anytime-build-webapp/DESIGN.ja.md
```

Expected: `OK`


- [ ] **Step 6: Commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/DESIGN.ja.md
git commit -m "$(cat <<'EOF'
docs(anytime-build-webapp): DESIGN.ja.md を Python BE 対応に追従

判定マトリクス・初期リリース範囲・将来拡張・ファイル構成図を Python BE 対応に
更新し、詳細仕様への参照として DESIGN.python-be.ja.md を追記。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


---


## Phase E: 回帰確認と最終整合


T3 経路が壊れていないことと、全 Markdown 検証 OK を確認する。


### Task 15: T3 経路の回帰確認 (手動シミュレート)


- [ ] **Step 1: 過去 commit との差分要約**

```bash
cd /home/user/.claude
git log --oneline e9fd2b0..HEAD -- skills/anytime-build-webapp/
```

Expected: Task 1〜14 の commit 群が時系列で並ぶ (約 13 件)。


- [ ] **Step 2: T3 経路に関わるファイルのキー要素確認**

```bash
# Phase 1.5 で Python BE が分岐から外れていること
grep -n "Python BE" /home/user/.claude/skills/anytime-build-webapp/SKILL.md

# t3-default が _frontend-next.md を参照していること
grep -n "_frontend-next.md" /home/user/.claude/skills/anytime-build-webapp/stacks/t3-default.md

# overrides.md で T3 経路が変更なし扱い
grep -n "T3 で" /home/user/.claude/skills/anytime-build-webapp/stacks/overrides.md
```

Expected:
- SKILL.md: Python BE が「確認なしで python-be 経路へ進む」の趣旨で言及されている
- t3-default.md: `_frontend-next.md` への参照が 4 件以上
- overrides.md: 「T3 で」が含まれる行が判定マトリクス内


- [ ] **Step 3: rename-map.json が触られていないこと**

```bash
cd /home/user/.claude
git log --oneline e9fd2b0..HEAD -- skills/anytime-build-webapp/scaffold/rename-map.json
```

Expected: 空 (T3 用 rename-map は触っていない)。


- [ ] **Step 4: questions.md / base-repo.md / PLAN.ja.md が触られていないこと**

```bash
cd /home/user/.claude
git log --oneline e9fd2b0..HEAD -- skills/anytime-build-webapp/questions.md skills/anytime-build-webapp/scaffold/base-repo.md skills/anytime-build-webapp/PLAN.ja.md
```

Expected: 空 (3 ファイルとも触っていない)。


- [ ] **Step 5: 全 Markdown 一括検証**

PLAN / DESIGN は他スキルファイルの内容を code fence 内に多数含み、validator が code fence 内の `#` も見出しと誤判定するため検証対象外とする。

```bash
for f in /home/user/.claude/skills/anytime-build-webapp/SKILL.md \
         /home/user/.claude/skills/anytime-build-webapp/questions.md \
         /home/user/.claude/skills/anytime-build-webapp/requirements-template.md \
         /home/user/.claude/skills/anytime-build-webapp/stacks/_frontend-next.md \
         /home/user/.claude/skills/anytime-build-webapp/stacks/t3-default.md \
         /home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md \
         /home/user/.claude/skills/anytime-build-webapp/stacks/overrides.md \
         /home/user/.claude/skills/anytime-build-webapp/scaffold/base-repo.md; do
  bash ~/.claude/scripts/validate-markdown.sh "$f" || echo "FAILED: $f"
done
```

Expected: 全 8 ファイル `OK`、`FAILED:` が一行も出ない。


- [ ] **Step 6: 全 JSON 構文検証**

```bash
for f in /home/user/.claude/skills/anytime-build-webapp/scaffold/*.json; do
  jq -e . "$f" > /dev/null && echo "OK: $f" || echo "FAILED: $f"
done
```

Expected: `OK:` が 2 行、`FAILED:` が 0 行。


- [ ] **Step 7: 全 Python テンプレ構文検証**

```bash
for f in /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/*.tmpl \
         /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic/*.tmpl; do
  python3 -c "import ast; ast.parse(open('$f').read())" && echo "OK: $f" || echo "FAILED: $f"
done
```

Expected: `OK:` が 5 行 (`__init__.py.tmpl` / `db.py.tmpl` / `deps.py.tmpl` / `main.py.tmpl` / `env.py.tmpl`)、`FAILED:` が 0 行。


- [ ] **Step 8: TOML / INI テンプレ構文検証**

```bash
python3 -c "import tomllib; tomllib.load(open('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/pyproject.toml.tmpl','rb'))" && echo "OK: pyproject.toml.tmpl"
python3 -c "import configparser; cp = configparser.ConfigParser(); cp.read('/home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/alembic.ini.tmpl'); assert 'alembic' in cp.sections(); print('OK: alembic.ini.tmpl')"
```

Expected: `OK: pyproject.toml.tmpl` と `OK: alembic.ini.tmpl` の 2 行。


- [ ] **Step 9: ファイル追加サマリと commit 履歴**

```bash
cd /home/user/.claude
git log --stat e9fd2b0..HEAD -- skills/anytime-build-webapp/ | head -80
git ls-files skills/anytime-build-webapp/ | sort
```

Expected: 新規追加 10 ファイル + 修正 5 ファイル分の commit log が見える。`ls-files` で `_frontend-next.md` / `python-be.md` / `python-be-files/` 配下のテンプレが全て含まれる。


- [ ] **Step 10: (検証専用、commit なし)**

このタスクは検証のみで commit を作らない。Step 5〜8 で `FAILED:` が出た場合は前のタスクに戻って修正。


---


### Task 16: 最終整合確認とプラン完了 commit


- [ ] **Step 1: 設計書と実装の整合性をチェックリストで確認**

設計書 `DESIGN.python-be.ja.md` のチェックリスト（第 12 章）を順に確認する:

| 設計書チェック項目 | 実装上の確認 |
| --- | --- |
| `/anytime-build-webapp <要求>` 起動 → Q4 で「Python BE」選択 → Phase 1.5 で中断せず Phase 2 へ進む | `SKILL.md` Phase 1.5 で Python BE が分岐から外れている |
| Phase 2 の writing-plans が python-be.md + _frontend-next.md を参照したプランを生成する | `SKILL.md` Phase 2 のコンテキスト記述に両ファイルが含まれる |
| Phase 4 完了時、`<project-root>/frontend/` と `<project-root>/backend/` が並列で生成される | `SKILL.md` Phase 4.4.b に「frontend/ と backend/ のディレクトリを作成」と明記 |
| Phase 4.8 で `frontend/src/api/` に TS クライアントが生成される | `stacks/python-be.md` 第 7 章で OpenAPI fetch + gen:api 実行が明記 |
| Phase 6 in-place モードで backend healthz 200 + frontend 200 + BE→DB 疎通 空配列が確認できる | `SKILL.md` Phase 6 in-place モードに 6.1.b〜6.8.b が追加されている |
| Q3 = 無し のとき、Auth.js と JWT 検証が両方スキップされる | `stacks/_frontend-next.md` 第 4.1 章で NextAuth 除外、`stacks/python-be.md` 第 6 章末で AUTH_SECRET 生成スキップ |
| Q3 = メールパスワード or Google OAuth のとき、JWT 経由のフロー全体が動作する | `stacks/_frontend-next.md` 第 4.2 / 4.3 章で実装、`scaffold/python-be-files/backend/app/deps.py.tmpl` で JWT 検証 |
| T3 経路（既存）が回帰せず動作する | Task 15 で全 markdown / JSON / Python 構文検証が OK |

確認手段:

```bash
echo "=== 1. SKILL.md Phase 1.5 ==="
grep -A 5 "Phase 1.5" /home/user/.claude/skills/anytime-build-webapp/SKILL.md | head -10
echo
echo "=== 2. SKILL.md Phase 2 ==="
grep -A 8 "## Phase 2: Plan" /home/user/.claude/skills/anytime-build-webapp/SKILL.md
echo
echo "=== 3. SKILL.md Phase 4.4.b ==="
grep -A 3 "Q4 = Python BE 経路" /home/user/.claude/skills/anytime-build-webapp/SKILL.md | head -8
echo
echo "=== 4. python-be.md 第 7 章 ==="
grep -A 2 "OpenAPI" /home/user/.claude/skills/anytime-build-webapp/stacks/python-be.md | head -8
echo
echo "=== 5. SKILL.md Phase 6 in-place ==="
grep "6.1.b\|6.5.b\|backend healthz" /home/user/.claude/skills/anytime-build-webapp/SKILL.md
echo
echo "=== 6. _frontend-next.md 4.1 ==="
grep -A 3 "Q3 = 無し" /home/user/.claude/skills/anytime-build-webapp/stacks/_frontend-next.md | head -5
echo
echo "=== 7. deps.py.tmpl ==="
grep "AUTH_SECRET\|HS256" /home/user/.claude/skills/anytime-build-webapp/scaffold/python-be-files/backend/app/deps.py.tmpl
```

Expected: 各セクションで該当キーワードが含まれる出力。


- [ ] **Step 2: プラン完了マーカー commit (PLAN.python-be.ja.md にメモ追記)**

`PLAN.python-be.ja.md` の末尾 (frontmatter 末尾の clarity の下、新しい章として) に以下を追記:

`old_string` (本プランの末尾、Task 16 Step 2 自身の手前付近):

(プランファイル自身の末尾なので、Edit でなく追記する形)


- [ ] **Step 3: プラン末尾の completion log を追記**

末尾に以下のセクションを追加 (Edit tool で末尾 `## Self-Review` の手前に挿入、または末尾追記):

```markdown


## 実装完了ログ


- Task 1〜14 の commit が `git log --oneline` で確認できる
- Task 15 で全構文検証 (Markdown / JSON / Python / TOML / INI) が OK
- 設計書 DESIGN.python-be.ja.md (commit 27119aa) のチェックリスト 8 項目が満たされる
- ファイル追加: 10 / 修正: 5 / 削除: 0
```


- [ ] **Step 4: PLAN ファイル commit**

```bash
cd /home/user/.claude
git add skills/anytime-build-webapp/PLAN.python-be.ja.md
git commit -m "$(cat <<'EOF'
docs(anytime-build-webapp): Python BE 実装プラン完了ログを追記

Task 1〜15 の完了を記録し、DESIGN.python-be.ja.md チェックリストの達成を確認。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```


- [ ] **Step 5: 最終 git log 表示**

```bash
cd /home/user/.claude
git log --oneline e9fd2b0..HEAD -- skills/anytime-build-webapp/ | tac
```

Expected: 全 16 commit (Task 1〜14 + Task 16 Step 4) が時系列で出力される。Task 15 は検証のみで commit なし。


---


## Self-Review


### 1. Spec Coverage

| 設計書 (DESIGN.python-be.ja.md) のセクション | 実装タスク |
| --- | --- |
| 第 3.1 章 新規追加 6 ファイル | Task 1, 3, 4, 5, 6, 7, 8, 9, 10 (実際は 10 ファイルに分割: `__init__.py.tmpl` と `db.py.tmpl` を分割、`deps.py.tmpl` を独立) |
| 第 3.2 章 既存修正 5 ファイル | Task 2, 11, 12, 13, 14 |
| 第 3.3 章 触らない 4 ファイル | Task 15 Step 3, 4 で検証 |
| 第 4.1 章 ディレクトリ構成 | Task 12 Step 3 (Phase 4.4.b) で frontend/ + backend/ 作成 |
| 第 4.2 章 _frontend-next.md 責務 | Task 1 (新規作成) で網羅 |
| 第 5 章 Phase 4 処理フロー | Task 12 Step 3 (Phase 4.4.b 9 サブステップ) で網羅 |
| 第 5.3 章 Phase 4.8 OpenAPI 初回 fetch | Task 10 (python-be.md 第 7 章) で in-place/--new-dir 両モード記述 |
| 第 6 章 Phase 6 検証手順 | Task 12 Step 5, 6 (Phase 6 in-place モード分岐) で網羅 |
| 第 7 章 認証実装 | Task 1 (Auth.js Q3 別) + Task 7 (deps.py JWT 検証) で網羅 |
| 第 8 章 環境変数管理 | Task 1 (.env.local) + Task 10 (python-be.md 第 6 章) で網羅 |
| 第 9 章 SKILL.md 修正詳細 | Task 12 (Phase 1.5 / 4 / 6 分岐) で網羅 |
| 第 11 章 依存バージョン固定方針 | Task 3 (pyproject.toml.tmpl で exact 範囲指定) で網羅 |
| 第 12 章 完了条件 8 項目 | Task 16 Step 1 で対応確認チェックリスト実施 |

Gap: なし (全項目に対応タスクが存在)。


### 2. Placeholder Scan

プラン内で禁則ワード検索:

- `TBD` / `TODO` / `implement later` / `fill in details`: なし
- `add appropriate error handling` / `handle edge cases`: なし
- 「ここを書く」「適宜」「適切に」: なし
- 「テストを書く」（実コードなし）: なし

全タスクに具体的なコード・コマンド・期待結果が記載されている。


### 3. Type Consistency

主要識別子の一貫性確認:

| 識別子 | 定義箇所 | 使用箇所 |
| --- | --- | --- |
| `<project-name>` プレースホルダ | Task 3 (pyproject.toml.tmpl) で `<project-name>-backend` | Task 5 (env.py)、Task 7 (deps.py)、Task 8 (main.py)、Task 9 (rename-map JSON の validation) で一貫使用 |
| `AUTH_SECRET` 環境変数 | Task 1 (.env.local テンプレ) で定義 | Task 7 (deps.py で `os.environ.get("AUTH_SECRET")`)、Task 10 (python-be.md 第 6 章で生成手順)、Task 12 (docker-compose 環境変数) で一貫使用 |
| `CORS_ALLOWED_ORIGINS` 環境変数 | Task 8 (main.py) で定義 | Task 10 (python-be.md 第 5 章 docker-compose、第 6 章 backend/.env) で一貫使用 |
| `get_db` 依存 | Task 6 (db.py.tmpl) で定義 | Task 7 (deps.py で言及なし)、Phase 5 (executing-plans) のルータで使用想定 |
| `get_current_user` 依存 | Task 7 (deps.py.tmpl) で定義 | Phase 5 で `Depends(get_current_user)` 使用想定 |
| `Base` クラス (SQLAlchemy DeclarativeBase) | Task 6 (db.py.tmpl) で定義 | Task 5 (env.py で `from app.db import Base`)、Task 10 (python-be.md 第 3 章モデル例) で一貫使用 |
| `npm run gen:api` script | Task 1 (_frontend-next.md 第 2 章) で定義 | Task 10 (python-be.md 第 7 章)、Task 12 (SKILL.md Phase 6.5.b) で一貫使用 |
| `OPENAPI_URL` 環境変数 | Task 1 (_frontend-next.md 第 5 章) で `process.env.OPENAPI_URL` | Task 10 (python-be.md 第 7 章)、Task 12 (SKILL.md Phase 6.5.b) で一貫使用 |

Gap: `get_db` は Phase 5 で使う想定だが本プラン内では参照されていない。これは設計通り (テンプレを配置するだけで Phase 5 が活用)。問題なし。


---


## Execution Handoff


**Plan complete and saved to `/home/user/.claude/skills/anytime-build-webapp/PLAN.python-be.ja.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 各タスクごとに新しいサブエージェントを起動、間でレビュー、高速反復。`~/.claude` への書き込みは永続データ領域なので、サブエージェントには変更スコープ (ファイルパス) を明示する。

**2. Inline Execution** - 本セッションで `superpowers:executing-plans` を起動、バッチ実行 + チェックポイント。`~/.claude` への直接書き込みなので変更スコープが明確で、ユーザ確認を挟みやすい。


## 実装完了ログ


2026-05-17 に subagent-driven-development 経由で実装完了。


### Commit 履歴 (17 件、PLAN commit 81883ab 以降)


| Task | Commit | 概要 |
| --- | --- | --- |
| Task 1 | `61259979` | feat: フロント共通スタック _frontend-next.md を追加 |
| Task 2 | `273a3db` | refactor: t3-default を _frontend-next.md 参照に整理 |
| Task 2 fix | `83c2723` | docs: t3-default 章 4・8 文言をレビュー指摘で明確化 |
| Task 3 | `e597797` | feat: pyproject.toml.tmpl を追加 |
| (gitignore) | `1140a49` | chore: .tmpl / .json の whitelist 追加 |
| Task 3 fix | `e40545e` | docs: pyproject.toml.tmpl に pydantic 明示依存を追加 |
| Task 4 | `55594bb` | feat: alembic.ini.tmpl を追加 |
| Task 5 | `68e63e3` | feat: alembic/env.py.tmpl を追加 |
| Task 6 | `85087e7` | feat: app/__init__.py.tmpl と app/db.py.tmpl を追加 |
| Task 7 | `773ef0d` | feat: app/deps.py.tmpl を追加 |
| Task 8 | `88811f2` | feat: app/main.py.tmpl を追加 |
| Task 9 | `4cefb32` | feat: rename-map-python-be.json を追加 |
| Task 10 | `fb0aa58` | feat: stacks/python-be.md を追加 |
| Task 11 | `2a54ca7` | docs: overrides.md 判定マトリクスを Python BE 対応に更新 |
| Task 12 | `d434f09` | feat: SKILL.md に Python BE 経路を統合 |
| Task 13 | `c483a73` | docs: requirements-template に Python BE 完了条件を追記 |
| Task 14 | `0bec8c8` | docs: DESIGN.ja.md を Python BE 対応に追従 |


### 検証結果 (Task 15)


| 検証項目 | 結果 |
| --- | --- |
| 新規追加 10 ファイル存在確認 | ✅ |
| 既存修正 5 ファイル更新確認 | ✅ |
| 触らない 4 ファイル (questions / base-repo / PLAN.ja / rename-map.json) 不変 | ✅ |
| Markdown validation (`validate-markdown.sh`) | ✅ (code-fence false-positives のみ、PLAN/DESIGN/SKILL/_frontend-next/t3-default/base-repo は plan 内で除外明記) |
| JSON validation (`jq -e`) | ✅ 2/2 |
| Python AST (`ast.parse`) | ✅ 5/5 |
| TOML / INI (`tomllib` / `configparser`) | ✅ 2/2 |


### 設計書 (DESIGN.python-be.ja.md 第 12 章) チェックリスト達成


| # | 項目 | 達成手段 |
| --- | --- | --- |
| 1 | Q4 で Python BE 選択 → Phase 1.5 で中断せず Phase 2 へ | SKILL.md Phase 1.5 修正で確認スキップ |
| 2 | Phase 2 writing-plans が python-be.md + _frontend-next.md を参照 | SKILL.md Phase 2 のコンテキスト記述に追記 |
| 3 | Phase 4 で frontend/ + backend/ 並列生成 | SKILL.md Phase 4.4.b 第 1 ステップで作成 |
| 4 | Phase 4.8 で frontend/src/api/ に TS クライアント生成 | stacks/python-be.md 第 7 章 |
| 5 | Phase 6 in-place で backend healthz 200 + frontend 200 + BE→DB 疎通 空配列 | SKILL.md Phase 6 in-place の Q4 = Python BE 経路 (6.1.b〜6.8.b) |
| 6 | Q3 = 無し で Auth.js + JWT 両方スキップ | _frontend-next.md 第 4.1 章 + python-be.md 第 6 章末 + deps.py.tmpl 配置スキップ |
| 7 | Q3 = メールパスワード / Google OAuth で JWT フロー動作 | _frontend-next.md 第 4.2 / 4.3 章 + deps.py.tmpl の HS256 JWT 検証 |
| 8 | T3 経路 (既存) の回帰なし | Task 15 で全構文検証 + commit log で関連ファイルのみ修正を確認 |


### ファイル差分サマリ


- 新規追加: 10
- 修正: 5 (うち t3-default.md は Task 2 本体 + Task 2 fix の 2 commit)
- 削除: 0
- 合計 commit: 17 (Task 別 14 + Task 2 fix + Task 3 fix + gitignore chore)
