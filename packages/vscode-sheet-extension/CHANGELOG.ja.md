# 変更履歴

"anytime-sheet" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.8.0] - 2026-06-20

### 変更

- `SheetEditorProvider` にチャート連携（charts チャネル・sidecar 永続化）を配線し、webpack の ts-loader allowlist に `chart-core` を追加。

### Spreadsheet Core (spreadsheet-viewer)

- undo/redo 履歴（スナップショット上限100・`transact` グルーピング）を実装し Ctrl+Z / Ctrl+Y 対応。
- フィルハンドルによるドラッグ連続入力（数値・末尾数字・等差・循環）。
- 選択範囲からのチャート作成（charts チャネル経由）。
- VS Code webview でのコピー/ペースト不具合を修正（execCommand フォールバック＋内部バッファ＋paste-bin）。
- コンテキストメニューが編集ダイアログ背後に隠れる z-index 問題を修正。
- 行高/列幅リサイズを undo 対象に追加。`liveSync` でセル編集を adapter へ即反映（ライブチャートプレビュー）。

## [0.7.0] - 2026-06-13

### Spreadsheet Core (spreadsheet-viewer)

- 新しい `anytime-spreadsheet` Web Component（React 非依存埋め込み）をバンドルに同梱。

## [0.6.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.6.0] - 2026-06-12

### 変更

- webview を vanilla bootstrap 化し、拡張バンドルから React を除去。

### Spreadsheet Core (spreadsheet-viewer)

- `spreadsheet-viewer` を React 非依存の vanilla 実装へ全面変換。`react` / `react-dom` / `next-intl` の peerDependencies を除去し、Markdown 表の全画面スプレッドシート編集を復元。

## [0.5.0] - 2026-06-08

### 変更

- `spreadsheet-viewer` の自前テーマ化に追随し、冗長な MUI ラッパを除去。

### Spreadsheet Core (spreadsheet-viewer)

- `spreadsheet-viewer` の `@mui` を全廃し自前 `ui/` キットへ置換（MUI 削減 Phase3c）。

## [0.4.6] - 2026-05-21

### 変更

- `spreadsheet-core` / `spreadsheet-viewer` 0.4.6 に合わせたバージョン更新（拡張固有のソース変更なし）

### Sheet Core (spreadsheet-core / spreadsheet-viewer)

- `spreadsheet-core`: SonarCloud 指摘を解消（S2004/S7758/S7780）。`InMemoryWorkbookAdapter` のカバレッジを 100% に向上（74→100%）

## [0.4.5] - 2026-05-20

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現を O(n) の `charCodeAt` スキャンに置き換え (CodeQL #818, `vscode-common`)

### Spreadsheet Core (spreadsheet-core)

- `parseCsv` の認知的複雑度 (S3776) 低減のため `readQuotedField` ヘルパーを抽出

### Spreadsheet Viewer (spreadsheet-viewer)

- anytime-sheet 0.4.5 に合わせたバージョン同期

## [0.4.4] - 2026-05-17

### 変更

- バージョンアップのみ (0.4.3 から機能変更なし)

### Spreadsheet Core (spreadsheet-core)

- バージョン同期のみ (機能変更なし)

### Spreadsheet Viewer (spreadsheet-viewer)

- バージョン同期のみ (機能変更なし)

## [0.4.3] - 2026-05-15

### Spreadsheet Core (spreadsheet-core)

- CRLF / CR と区切り行なし markdown テーブルのテストカバレッジを追加

### Spreadsheet Viewer (spreadsheet-viewer)

- 自己完結 i18n に移行。外部利用は公開 API 経由でのみメッセージを参照する形に統一

## [0.4.2] - 2026-05-08

### Spreadsheet Core (spreadsheet-core)

- ページネーション対応のための `SheetAdapter.getPageCount` メソッドを追加

### Spreadsheet Viewer (spreadsheet-viewer)

- ページネーションデータ操作用 `PaginationBar` コンポーネントを追加
- ツールバーの表示制御用 `showImportExport`・`showToolbar` prop を追加

## [0.4.1] - 2026-05-04

### 変更

- 軽微なメンテナンスと依存パッケージ更新

## [0.4.0] - 2026-05-03

### Spreadsheet Core (spreadsheet-core)

- `columnHeaders`・`rowHeaders`・`rotateColumnHeaders`・`cellSize` プロパティ追加
- DSM セル色付けと左上角クリック全選択
- コピー時に列/行ヘッダーラベルを含める

### Spreadsheet Viewer (spreadsheet-viewer)

- グループヘッダーの複数行・複数列対応
- `getCellBackground` 後のセル描画修正、ヘッダーの境界線追加

## [0.3.0] - 2026-04-23

### 追加

- 初版リリース: `.sheet`・`.csv`・`.tsv` ファイル向けカスタムエディタ
- `VSCodeWorkbookAdapter`: VS Code ドキュメントAPIを使用した `WorkbookAdapter` 実装（`.sheet` ファイルのマルチシート永続化をサポート）
- `SheetEditorProvider`: `.sheet` はワークブック形式、`.csv` / `.tsv` はシングルシートアダプタでそれぞれ開くカスタムエディタプロバイダ
- `SheetTabs` によるマルチシートナビゲーション（`.sheet` ファイルでシートの追加・名前変更・削除が可能）
