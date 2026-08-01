# Phase 6: Verification（起動確認）

`SKILL.md` から分離。Phase 5（実装）が完了し、生成物を実際に起動して確認する段でのみ読む。
in-place モード（デフォルト）と `--new-dir` モードで手順が分かれる。

本 Phase は **skill 本体** で完結する。モードによって手順が異なる。


### in-place モード（デフォルト）

Docker は使えない前提（Dev Container 内で実行中）。直接 npm / uv を使う。\
手順は Q4 で分岐する。


#### Q4 = 無し (T3 経路) の手順

##### 6.1.a. 依存解決

```bash
npm install
```

#### 6.2. アプリ起動

`.env` に `APP_PORT` があれば優先、無ければ `3000`。

```bash
APP_PORT=${APP_PORT:-3000}
npm run dev &
echo $! > /tmp/next-dev.pid

# 起動完了をポーリング（タイムアウト 60 秒）
timeout 60 bash -c "until curl -sf http://localhost:$APP_PORT > /dev/null 2>&1; do sleep 2; done"
```

#### 6.3. 疎通確認

```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT
```

期待: `200`。それ以外の場合は `npm run dev` の出力をダンプしてユーザに通知。

#### 6.4. テスト実行

```bash
npm test
```

失敗時はテスト出力をユーザに通知（中断はしない）。

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
4. dev サーバは起動したままです。停止する場合: `kill $(cat /tmp/next-dev.pid)`
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
# PID の取得（echo $!）は & と同じサブシェル内で行う。サブシェルの外の $! は uvicorn を指さない
(cd backend && nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn-server.log 2>&1 & echo $! > /tmp/uvicorn-server.pid)
timeout 60 bash -c 'until curl -sf http://localhost:8000/healthz > /dev/null; do sleep 2; done'
```

> [!IMPORTANT]
> `--host 0.0.0.0` を必ず付ける。`127.0.0.1` だと VS Code の Auto Port Forwarding に\
> 検出されず、ブラウザから localhost:8000 に到達できない。

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
# 内部は固定 port 3000 (package.json の dev script 参照)
# ブラウザ公開 port は CWD/.env の APP_PORT (例: 3002)
APP_PORT=$(grep -E '^APP_PORT=' "$PWD/.env" 2>/dev/null | cut -d= -f2)
APP_PORT=${APP_PORT:-3002}
(cd frontend && nohup npm run dev > /tmp/next-dev.log 2>&1 & echo $! > /tmp/next-dev.pid)
timeout 60 bash -c "until curl -sf http://localhost:$APP_PORT > /dev/null; do sleep 2; done"
curl -sS -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT
```

期待: `200` または `307` (middleware による未認証時の /login リダイレクト)

> [!IMPORTANT]
> `package.json` の `dev` script は内部 port 3000 を固定で使う。\
> docker-compose.yml の `ports: "${APP_PORT}:3000"` が host:APP_PORT → container:3000 を仲介する。\
> 両方を `${APP_PORT}` で連動させると mapping と食い違って `ERR_EMPTY_RESPONSE` になる。

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
   - 未認証時は /login にリダイレクト → /register で新規ユーザー作成
2. backend 開発時は別ターミナルで (必ず --host 0.0.0.0):
   (cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000)
3. スキーマ変更時:
   (cd backend && uv run alembic revision --autogenerate -m "<msg>")
   (cd backend && uv run alembic upgrade head)
   (cd frontend && OPENAPI_URL="http://localhost:8000/openapi.json" npm run gen:api)
4. VS Code ポートフォワード:
   - `3002` (frontend) と `8000` (backend) が「ポート」タブにあるか確認
   - 自動検出されない場合は手動追加
5. ブラウザコンソールに CORS エラーが出たら:
   - 実際の Next.js port (タイトルバーや起動ログで確認) を backend の
     CORS_ALLOWED_ORIGINS に合わせる
6. サーバは起動したままです。停止する場合:
   kill $(cat /tmp/uvicorn-server.pid) && kill $(cat /tmp/next-dev.pid)
```


### --new-dir モード

Docker daemon が使える前提。


#### 6.1. Dev Container build


```bash
docker compose -f .devcontainer/docker-compose.yml build
# または devcontainer CLI が使える環境では:
devcontainer up --workspace-folder .
```

失敗時は `docker logs` を表示し、ユーザに再試行 / 中断を確認。


#### 6.2. アプリ起動


```bash
docker compose -f .devcontainer/docker-compose.yml run --rm --service-ports app npm run dev &

# 起動完了をポーリング（タイムアウト 60 秒）
timeout 60 bash -c 'until curl -sf http://localhost:3000 > /dev/null 2>&1; do sleep 2; done'
```

`npm run dev` の起動ログ（stderr 含む）をキャプチャしておく。


#### 6.3. 疎通確認


```bash
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000
```

期待: `200`。それ以外の場合は `npm run dev` の出力をダンプしてユーザに通知。


#### 6.4. テスト実行


```bash
docker compose -f .devcontainer/docker-compose.yml run --rm app npm test
```

失敗時はテスト出力をユーザに通知（中断はしない）。


#### 6.5. 完了通知


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
