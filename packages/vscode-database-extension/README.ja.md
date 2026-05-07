# Anytime Database

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-database-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-database-extension/README.md)

**VS Code から離れずに SQLite データベースを閲覧・クエリ。**

Anytime Database は `.db` / `.sqlite` / `.sqlite3` / `.db3` ファイルを Custom Editor で開き、ページング対応のテーブルグリッド・タブごとの SQL エディタ・対話型 ER 図を提供します。\
[Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) 拡張機能と連携することで、ローカル Trail DB やリモートの Supabase / PostgreSQL を Activity Bar から確認することもできます。


## 1. SQLite Custom Editor

**現在できること:**

- `.db` / `.sqlite` / `.sqlite3` / `.db3` ファイルをエクスプローラから直接開く
- `anytimeDatabase.openMode` で readwrite / readonly を切替
- readwrite モードでは編集が `BEGIN IMMEDIATE` トランザクション内で進行し、`Ctrl+S` でのみ commit。VS Code 標準の revert で破棄も可能
- per-platform ネイティブバイナリ（`better-sqlite3`）が VSIX に同梱されており（linux/darwin/win32 × x64/arm64）、別途セットアップ不要

**使い方:** エクスプローラで `.db` / `.sqlite` ファイルを右クリック → **Open With…** → **Anytime Database** を選択。デフォルトエディタにしている場合はダブルクリックでも開きます。


## 2. テーブル閲覧 & SQL エディタ

**現在できること:**

- 左ペインの **TableTree** からテーブル / ビューを閲覧（ルートに DB ファイル名を表示）
- 複数テーブル / クエリを同時にタブで開く
- テーブルデータをページング表示（25 / 50 / 100 行、既定 50）。ad-hoc クエリタブではページャは非表示
- テーブルタブで **Data** / **Schema** ビューを状態を保持したまま切替
- タブごとの折りたたみ式 **SQL Editor** で任意 SQL を実行
  - トップレベル `LIMIT` がない場合は自動付与（既定 1000 行、`anytimeDatabase.query.maxRows` で変更可）
  - ステータスバーに直近クエリの行数・実行時間（またはエラーメッセージ）を表示
  - readonly モードでは更新系 SQL（`INSERT` / `UPDATE` / `DELETE` / DDL）を拒否
- 結果グリッドのカラムヘッダをダブルクリックすると、SQL エディタのカーソル位置にカラム名を挿入
- セル範囲を選択して `Ctrl+C` で TSV 形式でクリップボードにコピー


## 3. ER 図

**現在できること:**

- TableTree でデータベースルートを右クリック → **ER 図を表示** で ERD タブを開く
- 外部キーは `PRAGMA foreign_key_list`（複合 FK 含む）から推定し、直交エッジで描画
- [`graph-core`](https://github.com/anytime-trial/anytime-markdown/tree/master/packages/graph-core) の階層レイアウトで関連テーブルを近接配置
- マウスドラッグでパン、ホイールでズーム、ミニマップで全体を常時表示
- テーブルをクリックすると関連しないカードをフェードアウト、直接接続するテーブルを強調
- エッジは障害物回避ルーティングで重なりを抑制し、参照先カラム行にアンカー菱形を描画


## 4. Activity Bar（Database パネル）

**Anytime Database** の Activity Bar パネルでは、Anytime Trail 拡張機能のローカル `trail.db` および設定済みリモートバックエンドの状態を確認できます。

**現在できること:**

- Trail SQLite のステータス、最終インポート時刻、gzip バックアップ世代数を確認
- Anytime Trail で Supabase / PostgreSQL を設定している場合、状態 / 最終同期時刻 / 同期アクションを表示
- 行のインラインアクションから **Supabase に同期** / **Supabase に再接続** を実行

> [!NOTE]
> Activity Bar パネルは Anytime Trail のデータ連携状態を表示する用途が中心です。任意の SQLite ファイルを単体で閲覧する場合は Section 1 の Custom Editor を使用します。


## 5. 設定一覧

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeDatabase.openMode` | `readwrite` | SQLite ファイルを開くモード。`readwrite` は書き込み SQL と dirty/save UX を許可、`readonly` は `OPEN_READONLY` で開き書込を拒否する |
| `anytimeDatabase.query.maxRows` | `1000` | SQL Run の結果として表示する最大行数。これを超える結果は切り詰められ警告バナーが表示される |
| `anytimeDatabase.query.warnThresholdMs` | `5000` | 指定 ms を超えてクエリが完了した場合に警告を表示する |


## 6. コマンド一覧

| コマンド | タイトル |
| --- | --- |
| `anytime-database.syncToSupabase` | 同期（Supabase 行のインラインアクションに表示） |
| `anytime-database.reconnectSupabase` | 再接続（Supabase 行のインラインアクションに表示） |


## 7. per-platform 配布

`anytime-database` はネイティブコード（`better-sqlite3`）を含むため、6 種類の per-platform VSIX として配信されます:

| プラットフォーム | アーキテクチャ |
| --- | --- |
| Linux | x64, arm64 |
| macOS | x64, arm64 |
| Windows | x64, arm64 |

VS Code Marketplace が自動的に実行環境に合った VSIX をダウンロードします。汎用 (universal) ビルドはありません。


## 8. 多言語化

Activity Bar パネルのツリーアイテムラベルは VS Code の l10n バンドル（`l10n/bundle.l10n.json` + `l10n/bundle.l10n.ja.json`）で多言語化されています。VS Code の表示言語を日本語に設定すると、ステータス / バックアップ等のラベルが自動的に日本語に切り替わります。


## 9. ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
