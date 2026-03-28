# @anytime-markdown/cms-core

Core library for S3-based CMS operations in the Anytime Markdown project.

## Overview

Provides S3 client configuration and service functions for managing documents and reports stored in Amazon S3.

## Modules

| Module | Description |
| --- | --- |
| `client` | S3 client factory and configuration from environment variables |
| `docsService` | List, upload, and delete documents (Markdown and images) |
| `reportService` | List and upload report files (Markdown only) |

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

### Configuration

| Environment Variable | Default | Description |
| --- | --- | --- |
| `ANYTIME_AWS_REGION` | `ap-northeast-1` | AWS region |
| `S3_DOCS_BUCKET` | (required) | S3 bucket name |
| `S3_DOCS_PREFIX` | `docs/` | Key prefix for documents |
| `S3_REPORTS_PREFIX` | `reports/` | Key prefix for reports |
| `ANYTIME_AWS_ACCESS_KEY_ID` | (optional) | AWS access key (falls back to default credential chain) |
| `ANYTIME_AWS_SECRET_ACCESS_KEY` | (optional) | AWS secret key |

### Supported File Types

- Markdown: `.md`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`

## Testing

```bash
npm test -w packages/cms-core
```
