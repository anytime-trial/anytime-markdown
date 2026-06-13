# 変更ログ

"Anytime History" 拡張機能の主要な変更を記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に従います。

## [Unreleased]

## [0.2.5] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.2.4] - 2026-06-08

### 変更

- 同梱する `trace-viewer` から未使用の `@mui/material` peerDependency を除去。

## [0.2.3] - 2026-05-20

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現を O(n) の `charCodeAt` スキャンに置き換え (CodeQL #818, `vscode-common`)

## [0.2.2] - 2026-05-17

### 変更

- バージョンアップのみ (0.2.1 から機能変更なし)

## [0.2.1] - 2026-05-16

### 修正

- commit / save 時に編集中タブが強制クローズされる問題を修正

## [0.2.0] - 2026-05-15

### 追加

- git 呼び出しを Extension Host イベントループから切り離す非同期 `gitExec` ヘルパーを追加

### 変更

- **Breaking:** SpecDocs の保存先を `.vscode/history/` から `.trail/`（最終的に `.anytime/` 配下）へ移動
- 設定フォルダの既定値を `.trail` から `.anytime` に変更
- VS Code 拡張から `sql.js` を撤去しネイティブ sqlite に統一（Phase 4）
- `GitOperations` / `GitStatusParser` / `ChangesProvider` / `GraphProvider` / `SpecDocsGitOps` / `changesCommands` / git ルートの自動オープン処理を async 化し、Extension Host の応答性を維持
- `OutputChannel` 名を `Anytime History` に統一

### 修正

- spec のインポートパスと `DbLogger` インタフェースの不整合を解消
- node バンドルでの `navigator` アクセスを回避

## [0.1.0] - 2026-05-04

### 追加

- Trail DB 確認用 Database パネルを追加（Phase 2）

### 修正

- DB 同期設定の VS Code 設定二重登録警告を解消

### 変更

- `TimelineProvider` を `vscode-common` パッケージに移行し共有化

## [0.0.1] - 2026-04-12

### 変更

- VS Code Marketplace の名前競合解消のため、拡張機能名を Anytime Git（`anytime-git`）から Anytime History（`anytime-history`）に変更

## [0.1.1] - 2026-04-11

### 追加

- README・CHANGELOG・LICENSE ファイルを追加
- Trail 拡張機能から git 履歴をこのパッケージに移動

## [0.1.0] - 2026-04-11

### 追加

- リポジトリパネル: ファイルツリー、フォルダーを開く、リポジトリのクローン
- リポジトリツリーからのブランチ切替
- ファイル操作: 新規ファイル、新規フォルダー、名前変更、削除、インポート、切り取り・コピー・貼り付け
- リポジトリツリーの Markdown のみフィルター切替
- 変更パネル: ステージ済み・未ステージのファイルをグループ表示、変更数バッジ
- ファイル単位およびまとめてのステージ、アンステージ、変更破棄
- 変更パネルからのコミットとプッシュ
- グラフパネル: ASCII コミットグラフ
- タイムラインパネル: ファイルごとのコミット履歴と差分比較

## [0.0.3] - 2026-04-01

### 修正

- 変更パネルの未使用 isDoubleClick 変数にプレフィックスを追加

## [0.0.2] - 2026-03-29

### 変更

- 拡張機能アイコン画像を更新

## [0.0.1] - 2026-03-27

初回リリース。Anytime Markdown 拡張機能から Git treeview 機能を分離。

### 追加

**リポジトリ**

- フォルダーを開く・リポジトリをクローン
- 複数リポジトリの同時表示
- コンテキストメニューからブランチ切替
- ファイル操作（作成・削除・名前変更）、ドラッグ&ドロップ、切り取り/コピー/貼り付け
- Markdown ファイルのみ表示フィルター

**変更**

- リポジトリごとのステージ済み/未ステージ変更表示
- 個別ファイルのステージ、アンステージ、破棄
- すべてステージ、すべて解除、すべて破棄の一括操作
- コミットメッセージダイアログ
- プッシュ・同期（pull + push）
- サイドバーに変更数バッジ表示
- ファイル変更時の自動リフレッシュ（デバウンス）

**グラフ**

- `git log --graph` による ASCII コミットグラフ
- ローカル/リモートコミットの色分け表示（青/赤）
- ブランチ・タグの装飾表示
- HEAD、ブランチ、コミット用のカスタム SVG アイコン

**タイムライン**

- ファイルごとのコミット履歴（VS Code Git API + git コマンドフォールバック）
- 任意のコミットと作業コピーの比較

**連携**

- Anytime Markdown の比較モードとの連携（オプション、コマンドベース）
- Anytime Markdown 未インストール時は VS Code 標準 diff エディタにフォールバック
- 全 git コマンドで `execFileSync` を使用（コマンドインジェクション防止）
- git ファイルパス引数に `--` セパレーターを使用
