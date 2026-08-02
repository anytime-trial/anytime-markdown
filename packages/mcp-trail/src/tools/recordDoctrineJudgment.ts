import * as fs from 'node:fs';
import { z } from 'zod';
import { resolveDbPath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import { resolveCitations, type ResolvedCitation } from '../doctrine/resolveCitations';
import {
  recordDoctrineJudgmentDirect,
  type DoctrineJudgmentRecordResult,
} from '../sqlite/doctrineJudgments';

export const RecordDoctrineJudgmentInputSchema = z.object({
  session_id: z.string().min(1).describe('Recording session ID (Claude Code session UUID)'),
  subject: z
    .string()
    .min(1)
    .describe('What approval this judgment is for (stable key; re-recording the same subject overwrites and resets the human decision)'),
  judgment: z
    .enum(['approve', 'reject', 'escalate'])
    .describe('Agent judgment grounded in approved doctrine'),
  coverage: z
    .enum(['covered', 'silent', 'conflict', 'odd_out'])
    .describe('Doctrine coverage: covered / silent (no clause) / conflict (clauses disagree) / odd_out (outside ODD)'),
  citations: z
    .array(
      z.object({
        doc_path: z.string().describe('Absolute path to the doctrine document'),
        section: z.string().describe('Section heading the quote belongs to'),
        quote: z.string().describe('Verbatim quote from the document (whitespace differences tolerated)'),
      }),
    )
    .default([])
    .describe('Grounding citations. Each is resolution-checked (file exists + quote matches) at record time'),
  judged_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  workspacePath: z.string().optional().describe('Workspace root to resolve trail.db (defaults to cwd)'),
});

export type RecordDoctrineJudgmentInput = z.infer<typeof RecordDoctrineJudgmentInputSchema>;

export interface RecordDoctrineJudgmentResult extends DoctrineJudgmentRecordResult {
  readonly citations: ReadonlyArray<ResolvedCitation>;
}

/** 判断記録は router (HTTP-first) を経由しない。better-sqlite3 のファイル直書きは
 * SQLite のロックで並行安全であり、拡張側の HTTP ハンドラ追加・再配布を待たずに
 * 記録を開始できることを優先する (D1 は計測段階で書込頻度も低い)。 */
export async function handleRecordDoctrineJudgment(
  input: RecordDoctrineJudgmentInput,
): Promise<RecordDoctrineJudgmentResult> {
  const resolved = resolveCitations(
    input.citations.map((c) => ({ docPath: c.doc_path, section: c.section, quote: c.quote })),
    (path) => {
      try {
        return fs.readFileSync(path, 'utf8');
      } catch {
        // 不在・権限エラーは「解決不能な引用」として扱う (resolveCitations が file_not_found を記録する)
        return null;
      }
    },
  );
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = input.workspacePath ?? process.env['TRAIL_WORKSPACE_PATH'];
  const dbPath = resolveDbPath(workspacePath === undefined ? {} : { workspacePath });
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    const result = recordDoctrineJudgmentDirect(opened.db, {
      sessionId: input.session_id,
      subject: input.subject,
      judgment: input.judgment,
      coverage: input.coverage,
      citations: resolved,
      ...(input.judged_at === undefined ? {} : { judgedAt: input.judged_at }),
    });
    opened.save();
    return { ...result, citations: resolved };
  } finally {
    opened.close();
  }
}
