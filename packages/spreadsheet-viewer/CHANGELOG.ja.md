# 変更履歴

"spreadsheet-viewer" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.8.0] - 2026-06-20

### 追加

- グリッドに undo/redo 履歴（スナップショット上限100・`transact` で複数変更を1単位にまとめる）を実装し、Ctrl+Z / Ctrl+Y を内部履歴に配線。
- 選択範囲の右下角にフィルハンドルを追加し、ドラッグで連続入力（数値+1・末尾数字インクリメント・等差数列・循環）を可能に。補完値生成の純粋関数 `computeFillValues` を新設。
- 選択範囲からチャートを作成（`anytime-chart` フェンスを charts チャネル経由で出力）。

### 修正

- VS Code webview でグリッドのコピー/ペーストが動作しない問題を、`execCommand` フォールバック・内部クリップボードバッファ・paste-bin 方式の組み合わせで修正。
- コンテキストメニューが編集ダイアログ背後に隠れる z-index スタッキング問題を修正。
- 行高/列幅のリサイズを undo/redo 対象に追加し、`liveSync` でセル編集を adapter へ即反映（表チャートのライブプレビュー）。マージ前レビュー指摘（phantom undo 履歴・リサイズ undo の dirty 非対称・z-index 帯整合）を対処。

## [0.7.0] - 2026-06-13

### 追加

- React 非依存で埋め込める `anytime-spreadsheet` Web Component を追加。

## [0.6.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.6.0] - 2026-06-12

### 変更

- **spreadsheet viewer を React 非依存の vanilla 実装へ全面変換。** `createSpreadsheetT`・vanilla UI ファクトリ群・vanilla `SpreadsheetGrid` / `ContextMenu` を新設し、React 実装を置換。

### 削除

- React 版 spreadsheet 実装を削除し、peerDependencies から `react` / `react-dom` / `next-intl` を除去。

## [0.5.0] - 2026-06-08

### 変更

- `@mui` を全廃し、ランタイム style 注入の自前 `ui/` キットを新設して全画面を置換（MUI 削減 Phase3c）。

## [0.4.6] - 2026-05-21

### 変更

- `spreadsheet-core` 0.4.6 に合わせたバージョン更新（ソース変更なし）

## [0.4.5] - 2026-05-20

### 変更

- anytime-sheet 0.4.5 に合わせたバージョン同期

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現を O(n) の `charCodeAt` スキャンに置き換え (CodeQL #818, `vscode-common`)

## [0.4.4] - 2026-05-17

### 変更

- バージョンアップのみ (0.4.3 から機能変更なし)

## [0.4.3] - 2026-05-15

### 変更

- 自己完結 i18n に移行。外部利用は公開 API 経由でのみメッセージを参照する形に統一

## [0.4.2] - 2026-05-08

### 追加

- ページネーションデータ操作用 `PaginationBar` コンポーネントを追加
- ツールバーの表示制御用 `showImportExport`・`showToolbar` prop を追加

## [0.4.1] - 2026-05-04

### 追加

- セルのカスタムテキスト整形用 `getCellDisplayText` prop を追加

## [0.4.0] - 2026-05-03

### 追加

- グループヘッダーの複数行・複数列対応

### 修正

- `getCellBackground` 適用後にセル値が描画されない問題を修正
- 列ヘッダー行への縦の境界線を追加
- コーナーセルのグループ行境界に水平線を追加

## [0.3.0] - 2026-04-23

### 追加

- `SheetTabs` コンポーネント: マルチシートナビゲーション用タブバー（追加・名前変更・削除）
- `SpreadsheetEditor` に `workbookAdapter` prop: マルチシートドキュメントのサポート
- シートタブ操作の i18n キー: `addSheet`・`deleteSheet`・`renameSheet`・`sheetName`
- `SpreadsheetGrid` に `showHeaderRow` prop（`TableNodeView` でのみデフォルト有効）
- `SpreadsheetEditor` に `showToolbar` prop（Markdown テーブルエディタでのみデフォルト有効）
- `SpreadsheetEditor` に `headerRight` スロット prop: カスタムツールバー要素の挿入
- `spreadsheet-core` の `parseMarkdownTable` / `serializeMarkdownTable` を re-export

### 修正

- `SpreadsheetGrid` ラッパーへの `display:flex` 追加によってスクロール位置が壊れる問題を修正

### 変更

- キャンバスのスクロールバーをエディタに合わせてスリム化（6px・テーマ対応）
- シートビューアの色・レイアウトをデザインシステムトークンに統一
- `showRange` のデフォルトを `false` に変更（データ範囲ボーダーはオプトイン）
- `showApply` のデフォルトを `false` に変更（Apply ボタンはオプトイン）

## [0.2.0] - 2026-04-22

### 追加

- `SpreadsheetEditor`: CSV/TSV インポート・エクスポートツールバー付きページレベルコンポーネント
- i18n キー追加: `importCsv`・`exportCsv`・`importTsv`・`exportTsv`・`invalidJson`
- `spreadsheet-core` の `SheetAdapter`・`SheetSnapshot`・`createInMemorySheetAdapter`・`parseCsv`・`serializeCsv` を re-export

## [0.1.0] - 2026-04-22

### 追加

- `markdown-core/src/components/spreadsheet/` から `SpreadsheetGrid` / `SpreadsheetContextMenu` / `useSpreadsheetState` を切り出した初版
- `SheetAdapter` ベースに API を書き換え、`editor: Editor` 依存を除去
- viewer 専用 i18n ファイル `i18n/ja.json` / `i18n/en.json` を追加
- `getDivider` ユーティリティ (`styles.ts`) を markdown-core からミラー
- MockSheetAdapter テストヘルパー（`__tests__/support/createMockAdapter.ts`）
