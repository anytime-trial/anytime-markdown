export * from './types';
export * from './DatabaseAdapter';
export * from './identifier';
export * from './limitDetection';
export * from './sqlMutationCheck';
export * from './messaging';
export * from './RemoteDatabaseAdapter';
export * from './PaginatedSqlSheetAdapter';
// NOTE: 以下は Node 専用モジュールのためバレルに含めない (webview / SSR ビルドで壊れる)。
//   - BetterSqlite3Adapter: native binary を require
//   - SqlJsAdapter: sql.js が Node 用 require('fs') を持つ
//   - FileBackupManager: node:fs / node:zlib を使う
// 利用側は subpath import する:
//   import { BetterSqlite3Adapter } from '@anytime-markdown/database-core/BetterSqlite3Adapter';
//   import { SqlJsAdapter } from '@anytime-markdown/database-core/SqlJsAdapter';
//   import { FileBackupManager, type BackupEntry } from '@anytime-markdown/database-core/FileBackupManager';
