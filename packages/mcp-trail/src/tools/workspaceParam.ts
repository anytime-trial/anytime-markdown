import { z } from 'zod';

/**
 * 全ツール共通の `workspacePath` 引数。
 *
 * 解決順は `dbPath.ts` の `resolveWorkspacePath`（引数 > `TRAIL_WORKSPACE_PATH` > cwd）に一元化してある。
 * 各ツールが個別に `process.env` を読むと優先順が実装ごとにずれるため、宣言もここに寄せる。
 */
export const workspacePathParam = z
  .string()
  .optional()
  .describe('Workspace root used to resolve activity.db / caravan-book.db (defaults to TRAIL_WORKSPACE_PATH, then cwd)');
