---
name: anytime-doc-authoring
effort: low
description: /Shared/anytime-markdown-docs 配下のドキュメントを新規作成・執筆する時に、type（spec/tech/test/manual/proposal/plan/review/report）ごとの記載内容（何を書くか）・フォルダ構成・索引 index.[lang].md の自動生成運用を定義する。設計書（spec）の書き方・component spec の 2 ファイル分離・E2E シナリオ表・プランファイルの「変更対象ファイル」節・索引再生成が必要な時に使用する。構文・フロントマター・整形は anytime-markdown-output、既存設計書の読み方・辿り方は spec-lookup を使う。
---

# ドキュメント記載内容ガイド（anytime-doc-authoring）

更新日: 2026-07-11

`/Shared/anytime-markdown-docs/` 配下のドキュメントについて、**type ごとに「何を書くか」**（記載内容・構成・運用）を定義する。

## 0. スキルの分担

| スキル | 担当 |
| --- | --- |
| **anytime-doc-authoring**（本スキル） | 何を書くか（type 別の記載内容・フォルダ構成・索引運用） |
| `anytime-markdown-output` | どう書くか（GFM 構文・フロントマター仕様・整形・図表原則） |
| `spec-lookup` | どう読むか（索引 → frontmatter → 型付き related の progressive disclosure） |

## 1. 共通規則

### 1.1. フォルダ構成と命名

- **共通ドキュメント**（設計書・テスト項目書・マニュアル等）: `[topic]/` フォルダを作成し `[topic].[lang].md`（日英両方）を出力する。画像は `[topic]/images/`。
- **都度作成ドキュメント**（plan・review・report）: `[YYYYMMDD]-[topic].[lang].md` — 指示がなければ日本語のみ。
- `lang` は `ja` / `en`。type と出力先フォルダの対応は `anytime-markdown-output` §2.2。分類が不明な場合はユーザーに確認する。

### 1.2. 予約索引 `index.[lang].md`（各フォルダ必須・OKF 段階開示）

type フォルダおよびその全サブフォルダの直下に索引 `index.[lang].md` を置く（OKF の `index.md` 入れ子構造に相当）。

- 各索引は (1) 直下サブフォルダの索引へのリンク（件数つき）と (2) 直下ドキュメントの一覧・概要を載せ、ルートの `<type>/index.[lang].md` がサブフォルダ目次になる。
- 索引は frontmatter（title / category / excerpt / 型付き related）から `scripts/gen-spec-index.mjs` で**自動生成し手書きしない**（生成物のため手で編集しない）。
- **ドキュメントを追加・更新・改名・削除したら同フォルダの索引が必ず変わるため再生成を必須とする**（title / excerpt 変更でも索引表示がずれるため更新時も対象）。
- 対象 type に応じて再生成コマンドを実行する（リポジトリルートの npm scripts）:

  | type | コマンド |
  | --- | --- |
  | spec | `npm run spec:index` |
  | tech | `npm run tech:index` |
  | proposal | `npm run proposal:index` |
  | review | `npm run review:index` |

### 1.3. 共通の書き方原則

- **結論ファースト**: ファイル冒頭・各セクション冒頭に要点を先に置く。
- **1 ファイル 1 トピック・目安 400 行以下**: 超える場合は `##` 単位で分割し `related` と本文リンクで結ぶ。
- **既存コンセプトはインラインリンクで結ぶ**: 他の設計書・テーブル・パッケージ等に言及する際はルート相対リンクで接続する（note-graph のリンクグラフ形成）。
- frontmatter の `related` は型付き（`references` / `depends-on` / `implements` / `part-of` / `supersedes` / `refines`。語彙は `spec/33.graph/03.graph-viewer/note-relations.ja.md`）。

## 2. type 別の記載内容

### 2.1. spec（設計書）

機能仕様・アーキテクチャ設計・データモデル定義等。`spec/<NN>.<topic>/` の番号付きフォルダに配置する。

- **機能仕様＝外部仕様（black-box）で書く**。実装仕様（white-box）を書かない（詳細は §3.1）。
- `type: "spec"` には `c4Scope`（C4 モデル要素 ID 配列）を付与する（仕様は `anytime-markdown-output` §2.3）。
- 設計判断を含む場合はフロントマターに `status`（draft / accepted / implemented 等）を持たせ、実装完了時に更新する。
- パッケージ設計書（component spec）は §3 のルールに従う。

### 2.2. test（テスト項目書）

ユニット・E2E テストのケース一覧。

- E2E シナリオは機能セクションごとに 1 つの横型表（列固定: `| No | シナリオ | 前提条件 | 操作 | 期待結果 | 備考 |`）。詳細は §3.4。
- 期待結果は外部から決定論的に観測できるものに限定する（内部状態を書かない）。
- テスト観点の洗い出し・設計プロセスは `anytime-test-design-doc` スキルに従う。

### 2.3. proposal（提案）

改善提案・新機能提案・技術選定。**やるべきか（Why/What）**を扱い、実装手順（How)は plan に書く。

- 生成手順・テンプレート・思考法ガイドは `anytime-proposal` スキルに従う。

### 2.4. plan（実装計画）

タスク分解・変更対象・検証コマンドの定義。承認後に実装する。

- フロントマターに `clarity`（指示の明確さ 1〜100）を記載する（global CLAUDE.md「応答」）。
- **`## 変更対象ファイル` セクション（機械契約）**: 変更予定ファイルを `- ` + バッククォート付きパスの箇条書きで列挙する。agent-status hook（`agent-status-report.mjs` planned モード）がこの見出しを走査して plannedEdits を抽出するため、見出し文言・箇条書き形式を変えない。パスはワークスペースルート相対で書く。

  ```markdown
  ## 変更対象ファイル

  - `packages/<pkg>/src/<file>.ts`
  - `packages/<pkg>/README.md`
  ```

- 検証コマンド（ビルド・テスト・型チェック）は対象 `package.json` の `scripts` / `devDependencies` を事前確認して実在するものだけ書く（`AGENTS.md`「検証コマンドの実在確認」）。
- 進捗・完了状態はプランファイル自身に記録し、完了時に更新する。
- Codex へ委任するタスクは `codex-delegation` スキルの 6 点（対象/禁止範囲/完了条件/検証/中断条件/プロンプト）を記載する。

### 2.5. review（レビュー記録）

コードレビュー結果・設計レビュー記録。

- 指摘の書式（`### N. タイトル` + 重大度/カテゴリ/対象 + 行頭 `問題:`/`提案:` マーカー）は `review-finding-format` スキルに従う（trail memory-core ingest が機械読取する契約）。

### 2.6. report（レポート）

日次・週次調査、Issue 解決レポート等。Web アプリの `/report` ページに一覧表示される。

- `category` / `excerpt` は一覧表示・OG description に使われるため必ず付与する（機械契約は `anytime-markdown-output` §2.1.1）。

### 2.7. tech / manual

- **tech**: 技術調査・記事。比較は表＋評価軸を明示し、出典を脚注で示す（`anytime-markdown-output` 第 4 章）。
- **manual**: ユーザー向け操作ガイド。前提条件 → 手順（番号付き）→ 結果確認の順で書き、スクリーンショットには alt テキスト必須。

## 3. component spec（パッケージ設計書）の記載ルール

`spec/<NN>.<pkg>/` 配下のパッケージ設計書は、以下のルールで記載する。雛形は `spec/31.markdown-viewer/`。

### 3.1. 機能仕様（外部仕様）で書く

実装仕様（white-box）でなく **機能仕様＝外部仕様（black-box）** で書く。利用者・搭載製品から見た「何ができるか・どう振る舞うか」を記述する。

- **書く**: 編集モード、各機能の操作と結果、表示設定の選択肢と意味、入出力（GFM / frontmatter）、国際化、制約・非対応（non-goals）。
- **書かない（除外）**: ディレクトリ構成・ファイルツリー、拡張内部・NodeView・PluginKey、関数名／クラス名／型名（`createMarkdownMinimap` 等）、レイヤー図・依存一覧・ビルド／移管の内部事情、コードシンボル単位の API 表。
- 機能名は一般語で書き、内部識別子に依存しない。

### 3.2. 機能説明と E2E シナリオを別ファイルに分離

UI／挙動を持つパッケージは、同一フォルダに 2 ファイルを並置する。

| ファイル | type | category | 内容 |
| --- | --- | --- | --- |
| `<pkg>.ja.md` | `spec` | `<pkg>` 等 | 機能説明（各機能が何をするかの説明文＋説明表） |
| `<pkg>-e2e.ja.md` | `test` | `e2e` | E2E シナリオ表（テスト実施対象） |

- 相互リンク: `related` で spec → e2e は `references`、e2e → spec は `part-of`。本文冒頭にも相互リンクを置く。
- 純ロジック lib（end-user UI なし）は **シナリオを持たないため分離しない**。単一 spec に「入力 → 出力／振る舞い」の外部契約（公開 API の入出力・保証）を記述する。

### 3.3. 機能説明（`<pkg>.ja.md`）の書き方

- 各機能セクションは「何をするか」の説明文を **必ず**持つ（シナリオだけの節を作らない）。
- 説明表（モード一覧・設定一覧・コマンド一覧・入出力表・ツールバー表 等）は spec 側に残す。
- シナリオ表は置かない（e2e 側へ）。

### 3.4. E2E シナリオ（`<pkg>-e2e.ja.md`）の書き方

- 機能セクションごとに **1 つの横型表**を置く。列は固定:

  `| No | シナリオ | 前提条件 | 操作 | 期待結果 | 備考 |`

- 1 行＝1 シナリオ。`No` は **表単位で 1 始まり**。
- `期待結果` は外部から決定論的に観測できるもの（画面表示・挿入される Markdown・モード遷移・保存結果 等）に限定する。内部状態は書かない。
- 既存 `spec/30.markdown/test/e2e-test-list.md` の用語・粒度と整合させる。

### 3.5. 見出し粒度の整合

- 同一見出しレベルでは項目単位を揃える。要素名（例: ツールバー）と内容種別（例: シナリオ）を同レベルに混在させない。
- `### シナリオ` のような汎用見出しを作らない。
- 単一要素のためだけの冗長な `###` 見出しを作らず、本文の太字コード行等にする。

### 3.6. 内部相互参照

- 節への相互参照は **`§N` のプレーン参照**で書く。`](#日本語見出し)` アンカーリンクはスラッグが一致せず壊れるため使わない。

### 3.7. frontmatter と索引

- `title` は「<pkg> 機能仕様書」「<pkg> E2E シナリオ」。`updated` は編集当日。`type: "spec"` には `c4Scope` を付与（`anytime-markdown-output` §2.3）。
- 追加・更新・改名・削除のたびに同フォルダ索引を再生成する（§1.2。`npm run spec:index`）。
