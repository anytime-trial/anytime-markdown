import * as fs from 'node:fs';
import * as os from 'node:os';
import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveCaravanDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb } from '../sqlite/openDb';
import { resolveCitations, type ResolvedCitation } from '../doctrine/resolveCitations';
import { evaluateCoverageGate, type CoverageGateResult } from '../doctrine/coverageGate';
import { resolveOddConfig } from '../doctrine/oddRoots';
import { readFileTyped } from '../doctrine/readFile';
import {
  ensureAndMigrateDoctrineJudgments,
  fetchResolvedPoints,
  mergeDeclaredPoints,
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
  target_paths: z
    .array(z.string())
    .optional()
    .describe('Absolute paths the decision affects. Omitted = ODD boundary undecidable, which the coverage gate treats as escalate (fail-closed)'),
  severity: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Caller-declared severity. Omitted = undecidable, which the coverage gate treats as escalate (fail-closed)'),
  operation_kind: z
    .enum([
      'code_change',
      'dependency_change',
      'destructive_git',
      'remote_push',
      'production_release',
      'persistent_data_write',
    ])
    .optional()
    .describe('What kind of operation this approval covers. Omitted = undecidable, which the coverage gate treats as escalate (fail-closed). Everything except code_change always goes to the human: the gate is path-based and cannot see push / release / destructive git in target_paths'),
  underspecified_points: z
    .array(z.string())
    .optional()
    .describe(
      'Points the human\'s instruction does NOT determine, declared BEFORE asking (DCT-14). Declare here anything you are about to invent on the human\'s behalf (an unstated design fork, an unhandled case, a scope boundary the prompt is silent on). Omitting the field is undecidable and escalates (underspecified_unknown), exactly like omitting severity or operation_kind — pass [] explicitly to claim that the instruction alone fixes the outcome. A non-empty array also escalates: what to build is not yet determined, so no amount of doctrine grounding makes it delegable. Re-recording can add points but never remove them: a declaration that drops previously declared points is corrected to the union (additive-only ratchet, DCT-19)',
    ),
  judged_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  workspacePath: workspacePathParam,
});

export type RecordDoctrineJudgmentInput = z.infer<typeof RecordDoctrineJudgmentInputSchema>;

export interface RecordDoctrineJudgmentResult extends DoctrineJudgmentRecordResult {
  readonly citations: ReadonlyArray<ResolvedCitation>;
  /** カバレッジゲートの判定。D2 では delegable + approve が代行の根拠になる */
  readonly gate: CoverageGateResult;
}

/** 判断記録は router (HTTP-first) を経由しない。better-sqlite3 のファイル直書きは
 * SQLite のロックで並行安全であり、拡張側の HTTP ハンドラ追加・再配布を待たずに
 * 記録を開始できることを優先する (D1 は計測段階で書込頻度も低い)。 */
function readTextFile(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    // 不在・権限エラーは「解決不能」として扱う (呼び出し側が file_not_found / 既定値へ倒す)
    return null;
  }
}

export async function handleRecordDoctrineJudgment(
  input: RecordDoctrineJudgmentInput,
): Promise<RecordDoctrineJudgmentResult> {
  const resolved = resolveCitations(
    input.citations.map((c) => ({ docPath: c.doc_path, section: c.section, quote: c.quote })),
    readTextFile,
  );
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  // 保存先は caravan-book.db（2026-08-07 に activity.db から移設。旧テーブルは遅延移行で回収）
  const dbPath = resolveCaravanDbPathForWrite({ workspacePath });
  const opened = await openCaravanDb(dbPath, 'readwrite');
  try {
    ensureAndMigrateDoctrineJudgments(opened.db, dbPath);
    // DCT-19: 同一 (session, subject) の既存判断に記録済みの解消（人の回答）を読み、
    // 未解消の残りだけで規則 2.5 を評価する。ゲート評価は解消の読み込み後に行う必要が
    // あるため、DB open より後に置く
    const resolvedPoints = fetchResolvedPoints(opened.db, {
      sessionId: input.session_id,
      subject: input.subject,
    });
    // 申告は既存判断との和集合で評価する（部分削除の再記録でゲートを迂回させない —
    // 相互レビュー Codex #1）。保存側 recordDoctrineJudgmentDirect も同じ和集合を書く
    const declaredPoints = mergeDeclaredPoints(
      opened.db,
      { sessionId: input.session_id, subject: input.subject },
      input.underspecified_points,
    );
    const gate = evaluateCoverageGate({
      coverage: input.coverage,
      citations: resolved,
      targetPaths: input.target_paths,
      severity: input.severity,
      operationKind: input.operation_kind,
      underspecifiedPoints: declaredPoints,
      resolvedPoints,
      odd: resolveOddConfig({
        workspacePath: workspacePath ?? process.cwd(),
        homeDir: os.homedir(),
        readFile: readFileTyped,
      }),
    });
    const result = recordDoctrineJudgmentDirect(opened.db, {
      sessionId: input.session_id,
      subject: input.subject,
      judgment: input.judgment,
      coverage: input.coverage,
      citations: resolved,
      gate,
      // 列は NOT NULL。未申告はゲートが escalate 済みなので、保存側は空配列へ落とす
      underspecifiedPoints: input.underspecified_points ?? [],
      ...(input.judged_at === undefined ? {} : { judgedAt: input.judged_at }),
    });
    opened.save();
    return { ...result, citations: resolved, gate };
  } finally {
    opened.close();
  }
}
