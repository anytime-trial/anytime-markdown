# 変更履歴

"spreadsheet-viewer" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.1.0] - 2026-04-22

### 追加

- `markdown-core/src/components/spreadsheet/` から `SpreadsheetGrid` / `SpreadsheetContextMenu` / `useSpreadsheetState` を切り出した初版
- `SheetAdapter` ベースに API を書き換え、`editor: Editor` 依存を除去
- viewer 専用 i18n ファイル `i18n/ja.json` / `i18n/en.json` を追加
- `getDivider` ユーティリティ (`styles.ts`) を markdown-core からミラー
- MockSheetAdapter テストヘルパー（`__tests__/support/createMockAdapter.ts`）
