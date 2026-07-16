# Python BE (FastAPI) スタック構成

`anytime-lab` クローン + リネーム後に重ね合わせる Next.js + FastAPI 構成定義。

> [!IMPORTANT]
> フロントエンド共通部分 (Next.js / Tailwind / Auth.js / @hey-api/openapi-ts) は
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

`_frontend-next.md` 第 1〜8 章は `frontend/` ディレクトリで適用する。
本ファイル第 1 章以降は `backend/` ディレクトリで適用する。


## 1. 追加するパッケージ (uv 経由)

`scaffold/python-be-files/backend/pyproject.toml.tmpl` を `backend/pyproject.toml` に配置 (rename-map-python-be.json の対象)。
その後、`backend/` で `uv venv && uv sync` を実行 (Phase 6.1)。

主要依存:

| パッケージ | バージョン | 用途 |
| --- | --- | --- |
| fastapi[standard] | `^0.115` | Web フレームワーク |
| sqlalchemy | `^2.0` | ORM |
| alembic | `^1.13` | DB マイグレーション |
| psycopg[binary] | `^3.2` | Postgres ドライバ |
| python-jose[cryptography] | `^3.3` | JWT 検証 (Q3 = 無し以外で使用) |
| pydantic | `^2.9` | スキーマ |
| pydantic-settings | `^2.5` | 環境変数管理 |
| passlib[bcrypt] | `^1.7` | パスワードハッシュ (Q3 = メールパスワード) |
| uvicorn[standard] | `^0.32` | ASGI サーバ |
| ruff | `^0.7` | リンタ + フォーマッタ (dev) |
| pytest | `^8.3` | テスト (dev) |
| httpx | `^0.27` | テスト用 HTTP クライアント (dev) |


## 2. テンプレファイルの配置

`scaffold/python-be-files/backend/` 配下の `.tmpl` ファイルを `backend/` に展開する。
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

Phase 4（SKILL.md 第 4.4.b 章の手順 5）で `q2_entities` から `backend/app/models/<entity>.py` を生成する。

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
> リレーションは Phase 2 (writing-plans) の中で `executing-plans` に判断を委ねる。
> 本ファイルでは「最小カラム (`id` / `name` / `created_at`) のみ生成する初期テンプレ」とする。

`backend/app/models/__init__.py` に各モデルを import する:

```python
from app.models.stock import Stock as Stock
from app.models.price import Price as Price
from app.models.indicator import Indicator as Indicator
```


## 4. 初期 Alembic revision の生成

Phase 4（SKILL.md 第 4.4.b 章の手順 11）の最後で以下を実行。

```bash
cd backend
uv run alembic revision --autogenerate -m "init"
```

`backend/alembic/versions/<hash>_init.py` が生成される。Phase 6.3 で `uv run alembic upgrade head` を実行。


## 5. Dockerfile + docker-compose.yml への追加


### 5.1. Dockerfile (`local` ステージ)

`anytime-lab` 由来の Dockerfile は `git openssh-client sudo tmux sqlite3` + gh CLI のみで、Python ランタイム・ビルドツール・Postgres クライアントを持たない。Python BE 経路では `local` ステージの **既存の apt-get install 行に以下のパッケージをインライン追記**し、その後ろに uv インストールの RUN を追加する。

#### 5.1.1. 既存 apt-get install 行への追記

追記するパッケージ:

| パッケージ | 用途 |
| --- | --- |
| `ca-certificates` | HTTPS 証明書検証 (uv install / pip install で必須) |
| `build-essential` | C 拡張ビルド (psycopg, bcrypt 等) |
| `python3` | Python 本体 (Debian 12 標準の python3.11 を採用) |
| `python3-dev` | Python ヘッダ (C 拡張ビルドで必須) |
| `python3-venv` | venv モジュール (uv の互換動作で参照) |
| `libpq-dev` | psycopg のビルド依存 |
| `postgresql-client` | `psql` / `pg_isready` (compose の healthcheck・手動デバッグ用) |

> [!IMPORTANT]
> **`python3.13` / `python3.12` などの版指定 apt パッケージ名は使わない**。\
> `node:24-slim` (Debian 12 bookworm) の標準リポジトリには存在せず `Unable to locate package python3.13` で build が失敗する。`python3` (= 3.11) で `pyproject.toml` の `requires-python` 範囲を満たす設計とする。\
> `update-alternatives` も不要 (`python3` シンボリックリンクは apt が自動で張る)。

修正後の `local` ステージの apt-get install ブロック (anytime-lab の既存形式に Python BE 用パッケージを追加した形):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client sudo tmux sqlite3 \
    ca-certificates build-essential \
    python3 python3-dev python3-venv \
    libpq-dev postgresql-client && \
    rm -rf /var/lib/apt/lists/* && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update -qq && apt-get install -y -qq gh && \
    rm -rf /var/lib/apt/lists/*
```

#### 5.1.2. uv (Python パッケージマネージャ) の追加

上記 apt-get RUN の直後 (既存の `RUN groupmod -n user node ...` より前) に以下を挿入する。`/usr/local/bin` に置くことで `USER user` 切替後も実行可能。

```dockerfile
# uv (Python パッケージマネージャ) を /usr/local/bin に配置
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
```

#### 5.1.3. user 切替後の PATH 整備

既存の `USER user` 行の直後 (`ENTRYPOINT` より前) に以下を挿入する。uv が `~/.local/bin` 配下にキャッシュ・ツールを置くため。

```dockerfile
# uv が user 配下にキャッシュを置くため PATH を整える
ENV PATH="/home/user/.local/bin:${PATH}"
```

#### 5.1.4. 検証

Dockerfile を書き換えた後、`grep` で以下を確認する。

```bash
grep -q "python3 python3-dev python3-venv" Dockerfile && echo "OK: python3 apt packages"
grep -q "libpq-dev postgresql-client" Dockerfile && echo "OK: postgres deps"
grep -q "astral.sh/uv/install.sh" Dockerfile && echo "OK: uv install"
grep -q 'ENV PATH="/home/user/.local/bin' Dockerfile && echo "OK: uv PATH"
! grep -q "python3\.\(11\|12\|13\)" Dockerfile && echo "OK: no version-pinned python apt package"
```


### 5.2. docker-compose.yml

`docker-compose.yml` の `services:` セクションに `api` を追加。
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
    image: python:3.11-slim
    working_dir: /workspace/backend
    command: bash -c "pip install -e . && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    environment:
      DATABASE_URL: postgresql+psycopg://app:app@db:5432/app
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
DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app
AUTH_SECRET=<frontend/.env.local と同じ値>
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

> [!IMPORTANT]
> URL は `postgresql+psycopg://` 形式で **明示的にドライバ指定** する。\
> `postgresql://` だと SQLAlchemy が psycopg2 (未インストール) を探して `ModuleNotFoundError`。\
> 防衛策として `backend/app/db.py` 内でも `postgresql://` → `postgresql+psycopg://` に正規化済。

Phase 4.7 で `openssl rand -base64 32` を 1 回実行し、両ファイルの `AUTH_SECRET` に同じ値を書き込む。

> [!IMPORTANT]
> Q3 = 無し のときは `AUTH_SECRET` の生成・書き込みを **スキップ**する。
> Phase 4.4 で `app/deps.py.tmpl` も配置しない。


## 7. OpenAPI → TS クライアント生成

Phase 4.8 で `frontend/openapi-ts.config.ts` を `_frontend-next.md` 第 5 章のテンプレで配置する。
backend を一時起動して `/openapi.json` を fetch、`@hey-api/openapi-ts` で `frontend/src/api/` に TS クライアントを生成。

### 7.1. in-place モード

```bash
cd backend
nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn-bootstrap.log 2>&1 &
BE_PID=$!
trap "kill ${BE_PID} 2>/dev/null" EXIT

timeout 30 bash -c 'until curl -sf http://localhost:8000/openapi.json > /dev/null; do sleep 1; done'
curl -sf http://localhost:8000/openapi.json -o ../frontend/openapi.json

cd ../frontend
OPENAPI_URL="./openapi.json" npm run gen:api

kill ${BE_PID}
```

> [!IMPORTANT]
> `--host 0.0.0.0` を必ず付ける。デフォルト `127.0.0.1` だと Dev Container 内のループバックにしか\
> bind されず、VS Code の Auto Port Forwarding に検出されずブラウザから到達できない。

### 7.2. --new-dir モード

```bash
docker compose up -d api
timeout 60 bash -c 'until curl -sf http://localhost:8000/openapi.json > /dev/null; do sleep 2; done'
curl -sf http://localhost:8000/openapi.json -o frontend/openapi.json
docker compose stop api

(cd frontend && OPENAPI_URL="./openapi.json" npm run gen:api)
```


## 8. プランニング時の注意 (writing-plans / executing-plans 向け)

Phase 5 (executing-plans) でこのスタックの実装プランを書く / 実行する際の落とし穴。
**過去実行で踏んだ罠** を抽出したもの。プランに必ず織り込むこと。

### 8.1. pytest conftest

- `conftest.py` で `Base.metadata.create_all(bind=engine)` する前に\
  必ず `from app import models  # noqa: F401` を入れる。\
  これがないとモデルクラスが import されず metadata が空のままで、テーブルが作られない\
  (`sqlite3.OperationalError: no such table: users` の原因)。
- DB セッションを `commit()` するルータをテストする場合、\
  function-scope `db_session.rollback()` だけでは commit 済みデータが残ってテスト分離が崩れる。\
  `@pytest.fixture(autouse=True)` で全テーブルを `DELETE` する fixture を追加するか、\
  SAVEPOINT パターン (`join_transaction_mode="create_savepoint"`) を使うこと。

### 8.2. FastAPI DELETE エンドポイント

`@router.delete(..., status_code=status.HTTP_204_NO_CONTENT)` の関数で\
戻り値型に `-> None` を付けると、FastAPI が自動で `response_model` を導出して\
`AssertionError: Status code 204 must not have a response body` で起動失敗する。\
**明示的に `response_model=None`** を渡すこと:

```python
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_item(...) -> None:
    ...
```

### 8.3. backend のテスト実行

- `tests/conftest.py` で `os.environ.setdefault("DATABASE_URL", "sqlite:///./_test.db")` する。
- ただしテスト実行時にシェルで既に `DATABASE_URL=postgresql+psycopg://...` が export されていると\
  `setdefault` が無効になり Postgres を叩こうとする。\
  プランの test 実行コマンドは必ず明示的に env を渡す形にする:

```bash
DATABASE_URL=sqlite:///./_test.db AUTH_SECRET=test-secret \
  CORS_ALLOWED_ORIGINS=http://localhost:3000 uv run pytest
```

### 8.4. SDK 生成と client-fetch のバージョン整合

- Phase 5 で `frontend/openapi-ts.config.ts` の `format: "prettier"` を使う形が
  プランに残っていても、`@hey-api/openapi-ts@^0.97` では deprecation で実行は通るが\
  warn が出る。新規プランでは `output: "src/api"` のシンプル形を使うこと。
- SDK 関数の型エラー (`Property 'symbol' does not exist on type 'string | number'` 等) が出たら、\
  `@hey-api/client-fetch` のバージョンが古い可能性 → `^0.13` にアップグレード。

### 8.5. uv キャッシュ権限

`/home/user/.cache/uv` が root 所有になっていることがある (コンテナ初回起動直後)。\
`uv venv` 実行前に以下を確認:

```bash
[ -d /home/user/.cache/uv ] && [ ! -w /home/user/.cache/uv ] && \
  sudo chown -R user:user /home/user/.cache || true
```

代替として `UV_CACHE_DIR=/tmp/uv-cache uv ...` でも回避可能だが、`/tmp` は再起動で消える。

---

## 9. 完了条件

Phase 4 完了時、以下を全て満たすこと。

- `backend/pyproject.toml` が `<project-name>-backend` で生成される
- `backend/alembic.ini` / `backend/alembic/env.py` / `backend/app/main.py` / `backend/app/db.py` が存在
- Q3 = 無し以外なら `backend/app/deps.py` が存在
- `backend/app/models/<entity>.py` が Q2 エンティティごとに生成される
- `backend/alembic/versions/<hash>_init.py` が生成される
- `frontend/openapi-ts.config.ts` が生成される
- `frontend/.env.local` と `backend/.env` が AUTH_SECRET を共有 (Q3 = 無し以外)
- `docker-compose.yml` に `api` サービスと `db` サービスが定義される
- `Dockerfile` の `local` ステージに `python3 python3-dev python3-venv libpq-dev postgresql-client build-essential ca-certificates` が追記される (版指定 `python3.13` 等は使わない)
- `Dockerfile` に `astral.sh/uv/install.sh` 経由の uv インストールと `ENV PATH="/home/user/.local/bin:${PATH}"` が追記される
