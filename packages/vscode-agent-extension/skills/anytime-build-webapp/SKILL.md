---
name: anytime-build-webapp
description: Web アプリ・フルスタック MVP を新規生成する時に使用する（「Web アプリを作って」「MVP を生成」「雛形を作って」「/anytime-build-webapp」）。対象は WSL + Dev Container 上の T3 Stack または Next.js + FastAPI。画面デザインは参考 URL または DESIGN.md ファイル指定で適用可能。
# 本文の npm script・リポ相対パスは生成先リポジトリの文脈(check-skill-refs.mjs が照合を除外)
externalRepoRefs: true
---


# anytime-build-webapp スキル

更新日: 2026-07-16


`/anytime-build-webapp` 起動時に本ファイルがロードされる。以下の Phase 1〜6 を順に実行する。

> [!NOTE]
> 本文中の `<skillDir>` は、Skill ツールがロード時に通知する本スキルの Base directory を指す。\
> 参照ファイルは常に `<skillDir>` 基準で解決する（CWD がワークスペースルートと異なる起動でも参照が壊れない）。


## 起動形式


```text
/anytime-build-webapp <1行の要求> [--design-url <URL>] [--design-file <path>]
                          [--no-auth | --auth=email-password | --auth=google]
                          [--new-dir]
```


## 動作モード


本スキルは **2 つのモード**を持つ。デフォルトは in-place モード。

| モード | 起動方法 | 想定環境 | プロジェクトルート |
| --- | --- | --- | --- |
| **in-place（デフォルト）** | フラグ無し | Dev Container 内（Claude Code が動作している作業ディレクトリ） | CWD 自体 |
| **--new-dir** | `--new-dir` 指定 | WSL ホスト（Docker daemon が動作する空ディレクトリ） | `CWD/<project-name>/` |

> [!IMPORTANT]
> in-place モードは `.devcontainer/devcontainer.json` を**現状温存**する。\
> anytime-lab 側の `.devcontainer/` は破棄されるため、Postgres / forwardPorts 等の設定が必要なら手動でマージする。


## 起動前チェック


以下のいずれかに該当する場合、即座に中断してユーザに通知する。

- **`--new-dir` 指定時のみ**: CWD が空ディレクトリでない（`ls -A` で出力あり）
- **`--new-dir` 指定時のみ**: `docker info` が失敗する（Docker daemon 未起動）
- `ssh -T git@github.com` の戻り値が 1 でない（SSH 鍵未設定）

中断時メッセージ例:

```text
[anytime-build-webapp] 中断: --new-dir 指定時は CWD が空である必要があります。
別の空ディレクトリで実行するか、--new-dir を外して in-place モードで実行してください。
```

また **in-place モード**では、CWD に anytime-lab と衝突する既存ファイル（`scaffold/base-repo.md` 第 3 章の期待ファイル等）がある場合、Phase 4.1 の rsync が**無警告で上書きする**。該当時は上書き対象の一覧（既存 git リポジトリなら未コミット差分の有無も）を提示し、`AskUserQuestion` で続行可否を確認してから進む（確認ゲート・自動中断はしない）。


## Phase 1: Interview


1. `<skillDir>/questions.md` を Read する
2. 起動時 CLI 引数を解析し、`questions.md` 第 7 章の事前充足ルールに従って質問対象を絞る
3. 残った質問を **`AskUserQuestion` ツールで 1 問ずつ**順に実施する
4. 各回答をメモリに保持する（変数: `q1_purpose`・`q2_entities`・`q3_auth`・`q4_stack`・`q5_design`・`q5_design_value`）
5. `questions.md` 第 6 章の打ち切り条件に該当した時点で残り質問をスキップ
6. `<skillDir>/requirements-template.md` を Read し、プレースホルダを回答で置換
7. 置換後の内容を **CWD/requirements.md** に Write する
8. requirements.md の内容をチャットに要約表示し、`AskUserQuestion` で承認確認する（**What の承認**）
   - 選択肢: `OK で進める` / `修正する（回答を修正）` / `中断する`
   - `修正する` → 修正点を聞き、手順 6〜8 を再実行。`中断する` → 処理停止


### Phase 1.5: 未対応スタックの確認


Q4 が `Hono BE` / `その他` の場合、`stacks/overrides.md` 第 2 章のメッセージで `AskUserQuestion` を 1 回追加。

- `T3 デフォルトで進める` → Q4 を「無し」に上書きして続行
- `中断する` → Phase 1 で停止し、対応スタック追加リクエストとしてユーザに通知

Q4 が `Python BE` の場合は確認なしで `stacks/python-be.md` 経路へ進む（初期リリースで対応済み）。


## Phase 2: Plan


1. **`Skill` ツールで `superpowers:writing-plans` を起動**する
2. 渡すコンテキスト (Q4 で分岐):
   - 共通: `requirements.md`（CWD のもの）・`<skillDir>/scaffold/base-repo.md`・`<skillDir>/stacks/_frontend-next.md`
   - Q4 = 無し: `<skillDir>/stacks/t3-default.md`
   - Q4 = Python BE: `<skillDir>/stacks/python-be.md`
3. `writing-plans` が生成したプラン（通常 `docs/superpowers/plans/<date>-<topic>.md`）のパスを保持


## Phase 3: Plan Summary


要件書（What）は Phase 1 手順 8 で承認済みのため、プラン（How）には承認ゲートを置かない\
（開発プロセスの「What を承認し How は AI に委ねる」に整合）。

1. プランファイルのパスと内容をチャットに要約表示する（通知のみ・応答を待たずに Phase 4 へ進む）
2. プランが requirements.md と明らかに乖離している場合のみ、`AskUserQuestion` で確認して Phase 2 を再実行


## Phase 4: Scaffold


本 Phase は **skill 本体** で完結する。`executing-plans` には委譲しない。


### 4.1. クローン

`scaffold/base-repo.md` 第 2 章の手順に従う。

#### in-place モード（デフォルト）

```bash
PROJECT_NAME=$(basename "$PWD")
TEMP_DIR=$(mktemp -d)

git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git "$TEMP_DIR"
rm -rf "$TEMP_DIR/.git"

# .devcontainer は現状温存のため anytime-lab 側を破棄
rm -rf "$TEMP_DIR/.devcontainer"

# CWD に展開（既存ファイルは上書き、ただし .devcontainer は触らない）
rsync -a "$TEMP_DIR/" "$PWD/"
rm -rf "$TEMP_DIR"
```

`PROJECT_NAME` は **CWD basename** をそのまま使う。

#### --new-dir モード

```bash
git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git <project-name>
rm -rf <project-name>/.git
```

`<project-name>` は `q1_purpose` から導出（kebab-case 化、英数字のみ）。\
失敗時は `scaffold/base-repo.md` 第 4 章の対処に従う。


### 4.2. 期待ファイル検証

`scaffold/base-repo.md` 第 3 章の表のファイルが全て存在することを `test -f` で確認。\
1 つでも欠ければ中断してユーザに通知。

> [!NOTE]
> in-place モードでは `.devcontainer/devcontainer.json` は **既存ファイル**を指す（anytime-lab 側は破棄済み）。\
> --new-dir モードでは anytime-lab から展開された `<project-name>/.devcontainer/devcontainer.json` を指す。


### 4.3. リネーム置換

`scaffold/rename-map.json` を読み込み、`replacements[].find` を `replacements[].replace`（実プロジェクト名）に置換。

- 対象は `targets[]` のファイルのみ
- **in-place モードでは `.devcontainer/devcontainer.json` を targets から除外**（現状温存のため）
- 置換は `sed -i` で行う（`s|anytime-lab|<project-name>|g`）
- 置換後、`validations[]` のチェックを実行:
  - `jq` 系: `jq -r '<jq>' <file>` の結果が `expected` と一致（値は jq 式。例: `.name`）
  - `regex` 系: `grep -Pq '<regex>' <file>` が真（PCRE モード。GNU grep は行単位マッチで `\n` を含む複数行パターンに一致しないため、パターンは 1 行で完結させる）


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
8. `Dockerfile` の `local` ステージ apt-get install 行に Python BE 用 apt パッケージをインライン追記 + uv インストール RUN + `ENV PATH` を追加 (`python-be.md` 第 5.1 章)。`python3` を使い `python3.13` 等の版指定は避ける
9. `docker-compose.yml` に `api` + `db` サービスを追加 (`python-be.md` 第 5.2 章)
10. `frontend/.env.local` + `backend/.env` を生成 (`python-be.md` 第 6 章)。Q3 = 無し以外なら `openssl rand -base64 32` で AUTH_SECRET を生成し両 .env に書き込み
11. `backend` で `uv venv && uv sync` 実行 → `uv run alembic revision --autogenerate -m "init"` で初期 revision 生成
    - **uv キャッシュ権限**: 失敗時は `/home/user/.cache/uv` 所有権を確認。root 所有なら `sudo chown -R user:user /home/user/.cache`
    - **alembic 実行時の env**: `backend/.env` の `DATABASE_URL` は `postgresql+psycopg://` 形式 (`python-be.md` 第 6 章)。`uv run` は自動で .env を読まないので必要に応じて `export $(grep -v '^#' .env | xargs)` してから実行
12. `python-be.md` 第 7 章に従い backend 一時起動 + OpenAPI fetch + `frontend/src/api/` に TS クライアント生成
    - uvicorn は **`--host 0.0.0.0`** 必須 (`127.0.0.1` 既定だと外部から到達不可)


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


## Phase 4D: Apply Design Tokens


Q5 / CLI 引数の値で分岐する。詳細は `DESIGN.ja.md` 第 6.2 章を参照。\
（旧称 Phase 4.5。第 4.5 の初期 git commit・`DESIGN.python-be.ja.md` の内部ステップ 4.5〜4.9 と番号が衝突するため 4D と呼ぶ）


### 4D.1. Q5 = 無し

スキップして Phase 5 へ。


### 4D.2. Q5 = 参考 URL（`--design-url <URL>`）

1. **`Skill` ツールで `design-md` を起動**し、URL を入力として DESIGN.md を生成
2. 生成された DESIGN.md を `<project-root>/docs/DESIGN.md` に保存
3. 第 4D.3 と同じ処理に合流


### 4D.3. Q5 = DESIGN.md ファイル（`--design-file <path>`）

1. 指定パスを Read
2. デザイントークンを抽出（カラー・タイポ・スペーシング・角丸・シャドウ）
3. `tailwind.config.ts` の `theme.extend` に反映
4. `src/app/globals.css` の `:root` / `.dark` セレクタに CSS 変数として反映
5. `npx tsc --noEmit` で TypeScript チェック実行、失敗時は直前の設定にロールバック\
   （第 4.5 の初期 commit 済みなので `git restore tailwind.config.ts src/app/globals.css` で戻せる）


## Phase 5: Implementation


1. **`Skill` ツールで `superpowers:executing-plans` を起動**する
2. Phase 2 で生成したプランファイルを渡す
3. `executing-plans` の完了通知（`done` イベント）を待つ
4. 実装中のエラーは `executing-plans` が責任を持つ（Phase 5 内のリトライ）
5. `executing-plans` が完了通知を返したら **Phase 6 に進む**（skill 本体に制御が戻る）


## Phase 6: Verification


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
