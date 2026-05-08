# 変更履歴

"spreadsheet-viewer" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

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
