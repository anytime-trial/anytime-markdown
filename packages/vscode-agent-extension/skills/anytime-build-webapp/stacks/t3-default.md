# T3 Stack デフォルト構成

`anytime-lab` クローン + リネーム後に重ね合わせる T3 Stack の構成定義。

> [!IMPORTANT]
> Next.js / Tailwind / Auth.js / package.json scripts / src/ ディレクトリ構造の共通部分は **`stacks/_frontend-next.md`** に集約済み。\
> 本ファイルは T3 固有の差分（**tRPC・Prisma・Postgres compose・Dockerfile**）のみを記述する。


## 0. 前提

`_frontend-next.md` の第 1〜8 章をすべて先に適用してから、本ファイルの第 1 章以降を重ね合わせる。\
`_frontend-next.md` 第 1 章のパッケージに加えて、本ファイル第 1 章で tRPC + Prisma 系を追記する。


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

`_frontend-next.md` 第 3 章を適用済みの前提で、T3 では追加の Tailwind 設定は不要。\
`npx tailwindcss init -p` 実行後の `tailwind.config.ts` 上書きは `_frontend-next.md` で完了している。\
本章は参照のみ。


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

> [!IMPORTANT]
> **in-place モードでは本章をスキップ**（`.devcontainer/devcontainer.json` は現状温存）。\
> 必要なら手動で以下のキーを追記する。

| キー | 操作 | 値 |
| --- | --- | --- |
| `forwardPorts` | 既存配列に追加 | `5432` |
| `postCreateCommand` | 設定（無ければ追加） | `"npm install && npx prisma migrate dev --name init"` |
| `customizations.vscode.extensions` | 既存配列に追加 | `"Prisma.prisma"`・`"bradlc.vscode-tailwindcss"`・`"dbaeumer.vscode-eslint"` |


## 8. 追加する src/ ディレクトリ構造（T3 固有差分）

`_frontend-next.md` 第 6 章の `src/` 構造に加え、以下を T3 固有として追加する。\
`_frontend-next.md` で作成済みの `app/layout.tsx` / `app/page.tsx` / `app/globals.css` / `app/<entity>/*` の上に、以下の追加パスのみを作成する。

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
> `_frontend-next.md` 第 4 章は Q3 の選択に応じて `src/lib/auth.ts` を生成する。\
> T3 経路では NextAuth + Prisma Adapter を使うため、第 4 章で生成された `src/lib/auth.ts` を削除し、本章記載の `src/server/auth.ts` (Prisma Adapter 統合版) に置き換える。


## 9. 完了条件

Phase 4 完了時、以下が全て満たされていること。

- `package.json` の `dependencies` に T3 関連パッケージが含まれる
- `prisma/schema.prisma` が NextAuth + Q2 エンティティを含む
- `docker-compose.yml` に `db` サービスと `pgdata` ボリュームがある
- `src/app/`・`src/server/`・`src/lib/` のディレクトリ構造が存在する
- `npm run lint` が通る（type エラーなし）
