# 変更履歴

"anytime-sheet" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

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
