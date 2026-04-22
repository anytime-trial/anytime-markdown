# 変更履歴

"spreadsheet-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.2.0] - 2026-04-22

### 追加

- `InMemorySheetAdapter`: テストおよびスタンドアロン用途向けの `SheetAdapter` インメモリ実装
- `parseCsv` / `serializeCsv`: RFC 4180 準拠の CSV/TSV パーサ・シリアライザ

## [0.1.0] - 2026-04-22

### 追加

- `markdown-core/src/components/spreadsheet/` から型定義 (`CellAlign`, `DataRange`, `SheetSnapshot`, `SpreadsheetSelection`, `ColumnFilterState`, `CellEditState`, `ContextMenuState`) を切り出した初版
- `SheetAdapter` interface（`getSnapshot` / `subscribe` / `setCell` / `replaceAll` / `readOnly`）
- グリッド計算ユーティリティ `gridUtils` (`columnLabel` / `createEmptyGrid` / `isInDataRange` / `DEFAULT_GRID_ROWS` / `DEFAULT_GRID_COLS`)
