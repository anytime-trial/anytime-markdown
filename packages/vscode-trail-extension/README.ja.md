# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)**コードを書きながら、アーキテクチャを見る。**

TypeScript プロジェクトを解析して C4 アーキテクチャ図と DSM（依存構造マトリクス）を自動生成。\
Claude Code のセッションログを可視化して、AI との作業履歴を分析できます。


## C4 アーキテクチャ図 & DSM

1コマンドで、TypeScript プロジェクト全体の構造を4段階の詳細度で可視化します。

| レベル | 見えるもの |
| --- | --- |
| L1 System Context | システム全体と外部との関係 |
| L2 Container | アプリ・API・DB などの構成要素 |
| L3 Component | パッケージ・モジュール間の依存 |
| L4 Code | ファイル単位のすべての依存関係 |

![C4 Mermaid ダイアグラムの例](images/c4-mermaid.png)**ライブビューア** (`http://localhost:19841`)

- C4 グラフ、DSM マトリクス、要素ツリーの3ペイン構成
- L1 〜 L4 のレベル切替でドリルダウン
- DSM のクラスタリングで関連モジュールをグルーピング
- 循環依存を赤枠でハイライト
- VS Code での再解析・インポートが即座に反映（WebSocket 接続）
- **F-C Map**: Feature-Component 対応マトリクスを表示（DSM パネル内で切り替え）
- **削除要素表示**: 解析で消失した要素に削除フラグを付与し、取り消し線と半透明で表示
- **ドキュメントリンク**: `c4Scope` フロントマターを持つ Markdown ファイルを C4 要素と紐付けてビューア内から開く

**インポート / エクスポート**

- Mermaid C4 形式（`.mmd`）のインポートに対応
- JSON / Mermaid 形式でエクスポート可能


## Trail Viewer — Claude Code セッション分析

`http://localhost:19841` でブラウザビューアを起動し、Claude Code の作業ログを分析します。

**取り込み**

Claude Code が `~/.claude/` に書き出す JSONL ログをインポートし、SQLite DB に蓄積。\
サイドバーの **Dashboard** パネルから手動インポートを実行できます。

**ビューア機能**

- セッション一覧（ブランチ・モデル・日時でフィルタ）
- Analytics タブ: コスト推定・ツール使用量統計・コミット統計
- Prompts タブ: Claude Code スキル・`settings.json` の内容を表示

**リモート同期**

ローカル SQLite のデータを Supabase または PostgreSQL に同期できます。


## 設定一覧

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.trailServer.port` | `19841` | サーバーのポート番号 |
| `anytimeTrail.c4.modelPath` | `.vscode/c4-model.json` | C4 モデルの保存先 |
| `anytimeTrail.c4.analyzeExcludePatterns` | `[".worktrees", ...]` | 解析から除外するパターン |
| `anytimeTrail.docsPath` | `""` | C4 ドキュメントリンク用のドキュメントディレクトリの絶対パス |
| `anytimeTrail.coverage.path` | `""` | `coverage-final.json` へのパス（ワークスペースルートからの相対パス） |
| `anytimeTrail.coverage.historyLimit` | `50` | カバレッジ履歴スナップショットの最大保存件数 |
| `anytimeTrail.test.e2eCommand` | `cd packages/web-app && npm run e2e` | E2E テスト実行コマンド |
| `anytimeTrail.test.coverageCommand` | `npx jest --coverage --maxWorkers=1` | カバレッジ付きテスト実行コマンド |
| `anytimeTrail.remote.provider` | `none` | リモート DB プロバイダー（`none` / `supabase` / `postgres`） |
| `anytimeTrail.remote.supabaseUrl` | `""` | Supabase プロジェクト URL |
| `anytimeTrail.remote.supabaseAnonKey` | `""` | Supabase anon キー |
| `anytimeTrail.remote.postgresUrl` | `""` | PostgreSQL 接続文字列 |


## ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
