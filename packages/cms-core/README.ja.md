# @anytime-markdown/cms-core

Anytime Markdown プロジェクトの S3 ベース CMS コアライブラリ。

## 概要

Amazon S3 に保存されたドキュメントとレポートを管理するための S3 クライアント設定とサービス関数を提供します。

## モジュール

| モジュール | 説明 |
| --- | --- |
| `client` | S3 クライアントファクトリと環境変数からの設定 |
| `docsService` | ドキュメント（Markdown・画像）の一覧・アップロード・削除 |
| `reportService` | レポートファイル（Markdown のみ）の一覧・アップロード |

## API

```typescript
import {
  createCmsConfig,
  createS3Client,
  listDocs,
  uploadDoc,
  deleteDoc,
  listReportKeys,
  uploadReport,
} from '@anytime-markdown/cms-core';
```

### 設定

| 環境変数 | デフォルト | 説明 |
| --- | --- | --- |
| `ANYTIME_AWS_REGION` | `ap-northeast-1` | AWS リージョン |
| `S3_DOCS_BUCKET` | （必須） | S3 バケット名 |
| `S3_DOCS_PREFIX` | `docs/` | ドキュメントのキープレフィックス |
| `S3_REPORTS_PREFIX` | `reports/` | レポートのキープレフィックス |
| `ANYTIME_AWS_ACCESS_KEY_ID` | （任意） | AWS アクセスキー（未指定時はデフォルト認証チェーンを使用） |
| `ANYTIME_AWS_SECRET_ACCESS_KEY` | （任意） | AWS シークレットキー |

### 対応ファイル形式

- Markdown: `.md`
- 画像: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`

## テスト

```bash
npm test -w packages/cms-core
```
