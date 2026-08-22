# フロントエンド共通スタック（Next.js + Tailwind + Auth.js）

更新日: 2026-08-22

`stacks/t3-default.md` から参照される共通パーツ。

> [!NOTE]
> 本ファイルおよび `t3-default.md` のパッケージバージョン指定（`next@^15` / `tailwindcss@^3` 等）は\
> 上記更新日時点で検証済みの組合せ。scaffold の鮮度維持のため意図的に caret 指定とする。\
> 生成が失敗する場合はまずバージョンの鮮度を疑い、更新時は本ファイル第 1 章へ集約して個別章に散らさない。

> [!IMPORTANT]
> 本ファイルは **単独適用不可・参照専用**。\
> `t3-default.md` 経由でのみ呼ばれる。


## 1. 追加するパッケージ

クローン後のプロジェクトルートで実行。

```bash
# Runtime dependencies
npm install \
  next@^15 \
  react@^19 \
  react-dom@^19 \
  @tanstack/react-query@^5 \
  tailwindcss@^3 \
  next-auth@^5 \
  @auth/prisma-adapter@^2 \
  bcryptjs@^2 \
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
  @types/bcryptjs@^2 \
  prettier@^3
```

> [!IMPORTANT]
> `@auth/prisma-adapter` は NextAuth v5 系の Adapter。v4 系の `@next-auth/prisma-adapter` と混在させない\
> （`AdapterUser` の型が食い違い、`adapter` 引数で型エラーになる）。\
> `bcryptjs` は Q3 = メールパスワードでのみ使うが、条件付き install は package.json の差分を追いにくくするため常に入れる。


## 2. 追加する package.json scripts

```json
{
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

> [!IMPORTANT]
> `dev` / `start` は **コンテナ内部ポート 3000 を固定**で使う。\
> 公開ポート (ブラウザがアクセスする `http://localhost:<APP_PORT>`) は `docker-compose.yml` の\
> `ports: "${APP_PORT:-3002}:3000"` で決まる。両者を `${APP_PORT}` で連動させると、\
> Next.js が内部で `${APP_PORT}` (例 3002) に bind するため、`3002:3000` mapping と食い違って\
> `ERR_EMPTY_RESPONSE` になる。**内部=3000 固定、外部=APP_PORT 可変** の分離を必ず守ること。


## 3. 追加する Tailwind 設定

`npx tailwindcss init -p` 実行後、`tailwind.config.ts` を以下に上書き。

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Phase 4D (Apply Design Tokens) でデザイントークンが反映される
    },
  },
  plugins: [],
};

export default config;
```


## 4. 追加する Auth.js (NextAuth v5) 設定

Q3 の回答により分岐する。


### 4.1. Q3 = 無し

NextAuth を install しない（第 1 章から `next-auth` / `@auth/prisma-adapter` / `bcryptjs` を除外）。\
`src/server/auth.ts` / `src/app/api/auth/[...nextauth]/route.ts` を作成しない。


### 4.2. Q3 = メールパスワード

`src/server/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        return ok ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
});
```

> [!IMPORTANT]
> Credentials プロバイダは **`session.strategy: "jwt"` が必須**。既定の database session は\
> Credentials では発行されず、ログイン直後に未認証へ戻る（Adapter を付けても同じ）。\
> `User.passwordHash` は `t3-default.md` 第 3 章の Prisma schema に含まれる（Q3 = メールパスワードのみ）。\
> ハッシュ生成は `bcrypt.hash(password, 10)` を登録処理側で行う。

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
```

> [!IMPORTANT]
> NextAuth v5 では `handlers` から GET/POST を分解する必要がある。\
> `export { GET, POST } from "@/server/auth";` だと `Module has no exported member 'GET'` でビルド失敗。


### 4.3. Q3 = OAuth Google

`src/server/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [Google],
});
```

> [!NOTE]
> Google のみ（Credentials 無し）の場合は database session をそのまま使えるため `session.strategy` を指定しない。\
> `Account` / `Session` / `VerificationToken` は `t3-default.md` 第 3 章の schema が持つ。

## 5. 追加する src/ ディレクトリ構造

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
└── server/
    └── auth.ts             # NextAuth 設定 (Q3 別、第 4 章参照)
```


## 6. globals.css 最小定義

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```


## 7. .env.local テンプレ

```dotenv
# 共通
DATABASE_URL=postgres://app:app@db:5432/app

# Q3 が無し以外
AUTH_SECRET=<openssl rand -base64 32 で生成>
NEXTAUTH_URL=http://localhost:3000

# Q3 = Google のみ
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`DATABASE_URL` のホスト名 `db` は `docker-compose.yml` の Postgres サービス名。\
Dev Container の外（WSL ホスト）から直接 `npm run dev` する場合は `localhost` に読み替える。
