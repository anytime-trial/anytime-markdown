# 変更履歴

"anytime-sheet" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.3.0] - 2026-04-23

### 追加

- 初版リリース: `.sheet`・`.csv`・`.tsv` ファイル向けカスタムエディタ
- `VSCodeWorkbookAdapter`: VS Code ドキュメントAPIを使用した `WorkbookAdapter` 実装（`.sheet` ファイルのマルチシート永続化をサポート）
- `SheetEditorProvider`: `.sheet` はワークブック形式、`.csv` / `.tsv` はシングルシートアダプタでそれぞれ開くカスタムエディタプロバイダ
- `SheetTabs` によるマルチシートナビゲーション（`.sheet` ファイルでシートの追加・名前変更・削除が可能）
