# Phase 6: Verification（起動確認）

`SKILL.md` から分離。Phase 5（実装）が完了し、生成物を実際に起動して確認する段でのみ読む。
in-place モード（デフォルト）と `--new-dir` モードで手順が分かれる。

本 Phase は **skill 本体** で完結する。


## in-place モード（デフォルト）

Docker は使えない前提（Dev Container 内で実行中）。直接 npm を使う。


### 6.1. 依存解決

```bash
npm install
```


### 6.2. アプリ起動

`.env` に `APP_PORT` があれば優先、無ければ `3000`。

```bash
APP_PORT=${APP_PORT:-3000}
npm run dev &
echo $! > /tmp/next-dev.pid

# 起動完了をポーリング（タイムアウト 60 秒）
timeout 60 bash -c "until curl -sf http://localhost:$APP_PORT > /dev/null 2>&1; do sleep 2; done"
```


### 6.3. 疎通確認

```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT
```

期待: `200`。それ以外の場合は `npm run dev` の出力をダンプしてユーザに通知。


### 6.4. テスト実行

```bash
npm test
```

失敗時はテスト出力をユーザに通知（中断はしない）。


### 6.5. 完了通知（in-place）

```text
[anytime-build-webapp] 完了（in-place モード）
- プロジェクトルート: <CWD>
- プロジェクト名: <PROJECT_NAME>
- ベース: anytime-trial/anytime-lab
- スタック: T3 (Next.js + tRPC + Prisma + Tailwind + NextAuth)
- Dev Container: <--devcontainer で生成 / 既存を温存>
- 起動状態: http://localhost:<APP_PORT> (HTTP 200 確認済み)

次の手順:
1. ブラウザで http://localhost:<APP_PORT> を開いてください
2. Postgres を用意してください
   - `--devcontainer` で生成済みなら: WSL ホストで `docker compose up -d db`
   - 既存 .devcontainer を温存した場合は Postgres 未統合。`--devcontainer` を付けて再実行するか、
     docker-compose.yml の db サービスを手動で追記する
3. .env の DATABASE_URL を確認し、`npx prisma migrate dev --name init` を実行
4. dev サーバは起動したままです。停止する場合: `kill $(cat /tmp/next-dev.pid)`
```


## `--new-dir` モード

Docker daemon が使える前提。`--devcontainer` で生成した場合も本手順で確認する。

> [!IMPORTANT]
> `docker-compose.yml` は**プロジェクトルート**にある（`.devcontainer/` 配下ではない）。
> `.devcontainer/devcontainer.json` の `dockerComposeFile` が `../docker-compose.yml` を指す構成のため、
> `docker compose -f .devcontainer/docker-compose.yml` は必ずファイル不在で失敗する。
> service 名は `<project-name>`（`jq -r '.service' .devcontainer/devcontainer.json` で取得できる）。


### 6.1. Dev Container build

```bash
SERVICE=$(jq -r '.service' .devcontainer/devcontainer.json)
docker compose build
# または devcontainer CLI が使える環境では:
devcontainer up --workspace-folder .
```

失敗時は `docker compose logs` を表示し、ユーザに再試行 / 中断を確認。


### 6.2. アプリ起動

```bash
APP_PORT=${APP_PORT:-3000}
docker compose up -d db
docker compose run --rm --service-ports "$SERVICE" npm run dev &

# 起動完了をポーリング（タイムアウト 60 秒）
timeout 60 bash -c "until curl -sf http://localhost:$APP_PORT > /dev/null 2>&1; do sleep 2; done"
```

`npm run dev` の起動ログ（stderr 含む）をキャプチャしておく。


### 6.3. 疎通確認

```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT
```

期待: `200`。それ以外の場合は `npm run dev` の出力をダンプしてユーザに通知。


### 6.4. テスト実行

```bash
docker compose run --rm "$SERVICE" npm test
```

失敗時はテスト出力をユーザに通知（中断はしない）。


### 6.5. 完了通知（--new-dir）

```text
[anytime-build-webapp] 完了
- プロジェクト: <project-name>
- ベース: anytime-trial/anytime-lab
- スタック: T3 (Next.js + tRPC + Prisma + Tailwind + NextAuth)
- Dev Container: <--devcontainer で生成 / anytime-lab 由来>
- 起動状態: http://localhost:<APP_PORT> (HTTP 200 確認済み)

次の手順:
1. WSL ホスト側ブラウザで http://localhost:<APP_PORT> を開いてください
2. VS Code から Reopen in Container でコンテナ内開発を開始できます
```
