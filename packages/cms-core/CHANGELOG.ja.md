# 変更履歴

"cms-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.0.1] - 2026-03-27

初回リリース。

### 追加

- S3 クライアント設定（`createCmsConfig`, `createS3Client`）と環境変数サポート
- ドキュメントサービス: `listDocs`, `uploadDoc`, `deleteDoc` による S3 ドキュメント管理
- レポートサービス: `listReportKeys`, `uploadReport` による S3 レポート管理
- ファイル名バリデーション（パストラバーサル・特殊文字の防止）
- 許可ファイル形式の制限（`.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`）
- ドキュメント・レポートサービスのユニットテスト
