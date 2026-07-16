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
  zod@^3 \
  @hey-api/client-fetch@^0.13

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
  @hey-api/openapi-ts@^0.97 \
  prettier@^3
```

> [!IMPORTANT]
> `@hey-api/openapi-ts@^0.97` と `@hey-api/client-fetch@^0.13` はペアでバージョンを揃える。\
> 古い `openapi-ts@0.64` は `GetXxxResponse` (unwrap 済み) を SDK が直接 client に渡す方式だが、\
> `client-fetch@0.13` は `{ 200: T }` 形式の Wrapper を期待するため、ミスマッチで型がぶっ壊れる\
> （`data.symbol does not exist on type 'string | number'` 等）。\
> `prettier` は `@hey-api/openapi-ts` の `postProcess` で利用する任意ステップだが、\
> 0.97 では `format: "prettier"` 指定が deprecation 警告を出すため devDependencies に入れて統一する。


## 2. 追加する package.json scripts

```json
{
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "gen:api": "openapi-ts"
  }
}
```

`gen:api` は Python BE 経路でのみ使用。T3 経路では tRPC が型を持つため未使用 (定義はしておく)。

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
        const data = (await res.json()) as { access_token: string };
        return {
          id: String(credentials?.email ?? ""),
          email: String(credentials?.email ?? ""),
          accessToken: data.access_token,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.accessToken = (user as { accessToken: string }).accessToken;
      return token;
    },
    session: async ({ session, token }) => {
      (session as { accessToken?: string }).accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});
```

> [!IMPORTANT]
> `authorize` の戻り値は **FastAPI `/api/auth/login` のレスポンス形状** に合わせる。\
> 本テンプレでは FastAPI 側は `{access_token: string}` のみ返す前提 (User 情報は `/api/auth/me` で別取得)。\
> `data.user.id` のような nested アクセスは FastAPI の `TokenOut` スキーマに含まれないため壊れる。

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

> [!IMPORTANT]
> NextAuth v5 では `handlers` から GET/POST を分解する必要がある。\
> `export { GET, POST } from "@/lib/auth";` だと `Module has no exported member 'GET'` でビルド失敗。


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
  output: "src/api",
  plugins: ["@hey-api/client-fetch", "@hey-api/schemas", "@hey-api/sdk", "@hey-api/typescript"],
});
```

> [!NOTE]
> 0.64 系で使われていた `output: { path, format: "prettier" }` は 0.97 で deprecation 警告。\
> Prettier を呼ぶには `postProcess: ['prettier']` を指定する（要 prettier devDep）。\
> ローカル開発で整形が不要なら上記のように `output: "src/api"` のシンプル指定で十分。


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
