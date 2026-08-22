---
name: anytime-build-webapp
description: Web アプリ・フルスタック MVP を新規生成する時に使用する（「Web アプリを作って」「MVP を生成」「雛形を作って」「/anytime-build-webapp」）。対象は WSL + Dev Container 上の Next.js（T3 Stack）のみ。`--devcontainer` で Dev Container ファイル一式をスキル同梱テンプレから生成できる。画面デザインは参考 URL または DESIGN.md ファイル指定で適用可能。
# 本文の npm script・リポ相対パスは生成先リポジトリの文脈(check-skill-refs.mjs が照合を除外)
externalRepoRefs: true
---


# anytime-build-webapp スキル

更新日: 2026-08-22


`/anytime-build-webapp` 起動時に本ファイルがロードされる。以下の Phase 1〜6 を順に実行する。

> [!NOTE]
> 本文中の `<skillDir>` は、Skill ツールがロード時に通知する本スキルの Base directory を指す。\
> 参照ファイルは常に `<skillDir>` 基準で解決する（CWD がワークスペースルートと異なる起動でも参照が壊れない）。


## 起動形式


```text
/anytime-build-webapp <1行の要求> [--design-url <URL>] [--design-file <path>]
                          [--no-auth | --auth=email-password | --auth=google]
                          [--new-dir] [--devcontainer]
```

生成するスタックは **Next.js（T3 Stack: Next.js + tRPC + Prisma + Tailwind + NextAuth）に固定**する。\
バックエンド言語・フレームワークの選択肢は持たない（`stacks/overrides.md` 第 1 章）。


## 動作モード


本スキルは **2 つのモード**を持つ。デフォルトは in-place モード。

| モード | 起動方法 | 想定環境 | プロジェクトルート |
| --- | --- | --- | --- |
| **in-place（デフォルト）** | フラグ無し | Dev Container 内（Claude Code が動作している作業ディレクトリ） | CWD 自体 |
| **--new-dir** | `--new-dir` 指定 | WSL ホスト（Docker daemon が動作する空ディレクトリ） | `CWD/<project-name>/` |

> [!IMPORTANT]
> in-place モードは `.devcontainer/devcontainer.json` を**現状温存**する。\
> anytime-lab 側の `.devcontainer/` は破棄されるため、Postgres / forwardPorts 等の設定が必要なら手動でマージするか、\
> 下記 `--devcontainer` を指定する。


### `--devcontainer`（Dev Container ファイル生成）

WSL ホストで Dev Container をこれから作る場合に指定する。**両モードで有効**なモード直交のフラグ。

| 指定 | 生成物 | 既存ファイル |
| --- | --- | --- |
| なし（既定） | 生成しない | in-place は現状温存 / `--new-dir` は anytime-lab 由来 |
| `--devcontainer` | `.devcontainer/devcontainer.json`（常に）+ `docker-compose.yml`・`Dockerfile`（**不在時のみ**） | 既存 devcontainer.json は一覧提示 + `AskUserQuestion` 確認のうえ上書き |

生成元はスキル同梱テンプレ `scaffold/devcontainer-files/*.tmpl` で、anytime-lab のクローン結果に依存しない。\
手順・上書き確認・検証は `scaffold/devcontainer.md` を参照する。


## 起動前チェック


以下のいずれかに該当する場合、即座に中断してユーザに通知する。

- **`--new-dir` 指定時のみ**: CWD が空ディレクトリでない（`ls -A` で出力あり）
- **`--new-dir` 指定時のみ**: `docker info` が失敗する（Docker daemon 未起動）\
  （`--devcontainer` 単独ではファイル出力のみのため Docker daemon を要求しない）
- `ssh -T git@github.com` の戻り値が 1 でない（SSH 鍵未設定）

中断時メッセージ例:

```text
[anytime-build-webapp] 中断: --new-dir 指定時は CWD が空である必要があります。
別の空ディレクトリで実行するか、--new-dir を外して in-place モードで実行してください。
```

また **in-place モード**では、CWD に anytime-lab と衝突する既存ファイル（`scaffold/base-repo.md` 第 3 章の期待ファイル等）がある場合、Phase 4.1 の rsync が**無警告で上書きする**。該当時は上書き対象の一覧（既存 git リポジトリなら未コミット差分の有無も）を提示し、`AskUserQuestion` で続行可否を確認してから進む（確認ゲート・自動中断はしない）。


## Phase 1: Interview


1. `<skillDir>/questions.md` を Read する
2. 起動時 CLI 引数を解析し、`questions.md` 第 6 章の事前充足ルールに従って質問対象を絞る
3. 残った質問を **`AskUserQuestion` ツールで 1 問ずつ**順に実施する
4. 各回答をメモリに保持する（変数: `q1_purpose`・`q2_entities`・`q3_auth`・`q4_design`・`q4_design_value`）
5. `questions.md` 第 5 章の打ち切り条件に該当した時点で残り質問をスキップ
6. `<skillDir>/requirements-template.md` を Read し、プレースホルダを回答で置換
7. 置換後の内容を **CWD/requirements.md** に Write する
8. requirements.md の内容をチャットに要約表示し、`AskUserQuestion` で承認確認する（**What の承認**）
   - 選択肢: `OK で進める` / `修正する（回答を修正）` / `中断する`
   - `修正する` → 修正点を聞き、手順 6〜8 を再実行。`中断する` → 処理停止


## Phase 2: Plan


1. **`Skill` ツールで `superpowers:writing-plans` を起動**する
2. 渡すコンテキスト: `requirements.md`（CWD のもの）・`<skillDir>/scaffold/base-repo.md`・
   `<skillDir>/stacks/_frontend-next.md`・`<skillDir>/stacks/t3-default.md`
   （`--devcontainer` 指定時は `<skillDir>/scaffold/devcontainer.md` も渡す）
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


### 4.1.5. Dev Container ファイル生成（`--devcontainer` 指定時のみ）

`scaffold/devcontainer.md` の手順に従い、スキル同梱テンプレから生成する。

1. `.devcontainer/devcontainer.json` を `devcontainer.json.tmpl` から生成（`<project-name>` を置換）
2. `docker-compose.yml` / `Dockerfile` は**プロジェクトルートに存在しない場合のみ**テンプレから生成
3. 既存 `.devcontainer/devcontainer.json` があれば、対象一覧と現在値を提示して `AskUserQuestion` で
   `上書きする` / `生成をスキップする` / `中断する` を確認する（無警告で上書きしない）
4. 生成後は `scaffold/devcontainer.md` 第 4 章の検証（service 名の一致確認）を実行する

生成した場合、第 4.4 の `t3-default.md` 第 7 章（devcontainer.json への追記）は**スキップ**する（二重適用の回避）。
`生成をスキップする` を選んだ場合のみ第 7 章へフォールバックする。


### 4.2. 期待ファイル検証

`scaffold/base-repo.md` 第 3 章の表のファイルが全て存在することを `test -f` で確認。\
1 つでも欠ければ中断してユーザに通知。

> [!NOTE]
> in-place モードでは `.devcontainer/devcontainer.json` は **既存ファイル**を指す（anytime-lab 側は破棄済み）。\
> --new-dir モードでは anytime-lab から展開された `<project-name>/.devcontainer/devcontainer.json` を指す。\
> `--devcontainer` 指定時はいずれのモードでも第 4.1.5 で生成したファイルを指す。


### 4.3. リネーム置換

`scaffold/rename-map.json` を読み込み、`replacements[].find` を `replacements[].replace`（実プロジェクト名）に置換。

- 対象は `targets[]` のファイルのみ
- **in-place モードでは `.devcontainer/devcontainer.json` を targets から除外**（現状温存のため）
- **`--devcontainer` で生成したファイルも targets から除外**（生成時に `<project-name>` 置換済みのため二重置換になる）
- 置換は `sed -i` で行う（`s|anytime-lab|<project-name>|g`）
- 置換後、`validations[]` のチェックを実行:
  - `jq` 系: `jq -r '<jq>' <file>` の結果が `expected` と一致（値は jq 式。例: `.name`）
  - `regex` 系: `grep -Pq '<regex>' <file>` が真（PCRE モード。GNU grep は行単位マッチで `\n` を含む複数行パターンに一致しないため、パターンは 1 行で完結させる）


### 4.4. スタック重ね合わせ

`stacks/_frontend-next.md` 第 1〜7 章を適用後、`stacks/t3-default.md` 第 1〜8 章を重ね合わせる。

1. `_frontend-next.md` 第 1 章 + `t3-default.md` 第 1 章 (T3 固有パッケージ追加)
2. `_frontend-next.md` 第 2 章 + `t3-default.md` 第 2 章 (Prisma scripts 追記)
3. `t3-default.md` 第 3 章 (Prisma 初期化 + schema 上書き) — Q2 エンティティを末尾に追加
4. `_frontend-next.md` 第 3 章 (Tailwind 設定)
5. `t3-default.md` 第 5 章 (`docker-compose.yml` に Postgres + volumes 追記)
6. `t3-default.md` 第 6 章 (`Dockerfile` に postgres-client + Prisma CLI 追記)
7. `t3-default.md` 第 7 章 (`.devcontainer/devcontainer.json` 修正) — **in-place モードではスキップ**。
   `--devcontainer` で生成済みの場合も**スキップ**（第 4.1.5）
8. `_frontend-next.md` 第 5 章 + `t3-default.md` 第 8 章 (`src/` ディレクトリ構造)

第 5〜6 章は `--devcontainer` でテンプレ生成した `docker-compose.yml` / `Dockerfile` に対しても適用する。
テンプレは Postgres サービスと postgresql-client / Prisma CLI を既に含むため、既存の記述と重複する追記は行わない（冪等）。


### 4.5. 初期 git commit

commit メッセージは `chore: initial scaffold from anytime-lab + T3 Stack` とする。

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


## Phase 4D: Apply Design Tokens


Q4（デザイン参照源）/ CLI 引数の値で分岐する。詳細は `DESIGN.ja.md` 第 6.2 章を参照。\
（旧称 Phase 4.5。第 4.5 の初期 git commit と番号が衝突するため 4D と呼ぶ）


### 4D.1. デザイン参照源 = 無し

スキップして Phase 5 へ。


### 4D.2. 参考 URL（`--design-url <URL>`）

1. **`Skill` ツールで `design-md` を起動**し、URL を入力として DESIGN.md を生成
2. 生成された DESIGN.md を `<project-root>/docs/DESIGN.md` に保存
3. 第 4D.3 と同じ処理に合流


### 4D.3. DESIGN.md ファイル（`--design-file <path>`）

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

起動確認の手順は `.claude/skills/anytime-build-webapp/verification.md` に分離した。
Phase 5 完了後にそのファイルを読み、in-place / `--new-dir` の該当モードの手順を実行する。

- in-place モード（デフォルト）: CWD で dev サーバーを起動し、ポーリングで起動完了を待って疎通を確認する
- `--new-dir` モード: devcontainer を起動してから同様に確認する
- `--devcontainer` で生成した場合も `--new-dir` 手順（`docker compose` による build → 起動）で確認する

**このフェーズを飛ばして完了報告しない**（起動していないものを「動く」と報告しないため）。


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
| `.claude/skills/anytime-build-webapp/verification.md` | Phase 6 起動確認手順（in-place / --new-dir） |
| `.claude/skills/anytime-build-webapp/questions.md` | 4 問インタビュー定義 |
| `.claude/skills/anytime-build-webapp/requirements-template.md` | 要件 md テンプレ |
| `.claude/skills/anytime-build-webapp/stacks/_frontend-next.md` | フロント共通 (Next.js + Tailwind + Auth.js) |
| `.claude/skills/anytime-build-webapp/stacks/t3-default.md` | T3 重ね合わせ手順 (固有差分のみ) |
| `.claude/skills/anytime-build-webapp/stacks/overrides.md` | スタック固定の方針と将来追加手順 |
| `.claude/skills/anytime-build-webapp/scaffold/base-repo.md` | `anytime-lab` クローン手順 |
| `.claude/skills/anytime-build-webapp/scaffold/rename-map.json` | リネーム置換マップ |
| `.claude/skills/anytime-build-webapp/scaffold/devcontainer.md` | `--devcontainer` の生成手順・上書き確認・検証 |
| `.claude/skills/anytime-build-webapp/scaffold/devcontainer-files/` | Dev Container テンプレ (devcontainer.json / docker-compose.yml / Dockerfile) |
