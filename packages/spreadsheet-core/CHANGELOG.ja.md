# 変更履歴

"spreadsheet-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.4.2] - 2026-05-08

### 追加

- ページネーション対応のための `SheetAdapter.getPageCount` メソッドを追加

## [0.4.1] - 2026-05-04

### 追加

- セルのカスタムテキスト整形用 `getCellDisplayText` prop を追加

## [0.4.0] - 2026-05-03

### 追加

- 列ヘッダーラベルをカスタマイズできる `columnHeaders` プロパティ
- 行ラベル表示用の `rowHeaders` / `rowHeaderWidth` プロパティ
- 列ヘッダーを 90° 縦表示する `rotateColumnHeaders` プロパティ
- 正方形セル初期化用の `cellSize` プロパティ
- DSM セルの背景色付けサポート
- 左上角クリックで全セルを選択
- コピー時に `columnHeaders` / `rowHeaders` をラベルとして含める

## [0.3.0] - 2026-04-23

### 追加

- `WorkbookAdapter` インターフェース: マルチシート抽象化（`getSheets` / `getActiveSheetIndex` / `setActiveSheet` / `subscribe`）
- `InMemoryWorkbookAdapter`: `WorkbookAdapter` のインメモリ実装
- `SheetData` / `WorkbookSnapshot` 型: マルチシートドキュメント表現
- `parseMarkdownTable` / `serializeMarkdownTable`: GFM テーブル ↔ `SheetSnapshot` の双方向変換
- パッケージ index から markdown ユーティリティ（`parseMarkdownTable`・`serializeMarkdownTable`）を export

### 修正

- `parseMarkdownTable`: コロンのみのセルを GFM 準拠の配置マーカーとして扱うセパレータ行検出に修正

### 変更

- `showApply` / `showRange` prop のデフォルトを `false` に変更（利用時は明示的に有効化が必要）

## [0.2.0] - 2026-04-22

### 追加

- `InMemorySheetAdapter`: テストおよびスタンドアロン用途向けの `SheetAdapter` インメモリ実装
- `parseCsv` / `serializeCsv`: RFC 4180 準拠の CSV/TSV パーサ・シリアライザ

## [0.1.0] - 2026-04-22

### 追加

- `markdown-core/src/components/spreadsheet/` から型定義 (`CellAlign`, `DataRange`, `SheetSnapshot`, `SpreadsheetSelection`, `ColumnFilterState`, `CellEditState`, `ContextMenuState`) を切り出した初版
- `SheetAdapter` interface（`getSnapshot` / `subscribe` / `setCell` / `replaceAll` / `readOnly`）
- グリッド計算ユーティリティ `gridUtils` (`columnLabel` / `createEmptyGrid` / `isInDataRange` / `DEFAULT_GRID_ROWS` / `DEFAULT_GRID_COLS`)
