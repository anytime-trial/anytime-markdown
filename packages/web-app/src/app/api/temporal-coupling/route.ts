import type { CommitFileRow, SessionFileRow } from '@anytime-markdown/trail-activity';
import {
  computeConfidenceCoupling,
  computeSessionConfidenceCoupling,
  computeSessionCoupling,
  computeTemporalCoupling,
} from '@anytime-markdown/trail-activity';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NO_STORE_HEADERS } from '../../../lib/api-helpers';
import { resolveSupabaseEnv } from '../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

/** 拡張機能の defaultTemporalCouplingPathFilter と同一のブラックリスト */
const EXCLUDE_PATTERNS: readonly RegExp[] = [
  /\.lock$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /\.min\.js$/,
  /\.map$/,
  /(^|\/)\.worktrees\//,
  /(^|\/)\.claude\//,
  /(^|\/)\.vscode\//,
  /(^|\/)\.next\//,
  /(^|\/)out\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
];

function pathFilter(filePath: string): boolean {
  return !EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const v = raw === null ? def : Number.parseInt(raw, 10);
  return Number.isNaN(v) ? def : Math.min(max, Math.max(min, v));
}
function clampFloat(raw: string | null, def: number, min: number, max: number): number {
  const v = raw === null ? def : Number.parseFloat(raw);
  return Number.isNaN(v) ? def : Math.min(max, Math.max(min, v));
}

type Granularity = 'commit' | 'session' | 'subagentType';

interface CouplingQuery {
  granularity: Granularity;
  directional: boolean;
  windowDays: number;
  topK: number;
  minChangeCount: number;
  jaccardThreshold: number;
  confidenceThreshold: number;
  directionalDiff: number;
  maxFilesPerCommit: number;
}

function resolveGranularity(raw: string | null): Granularity {
  if (raw === 'session') return 'session';
  if (raw === 'subagentType') return 'subagentType';
  return 'commit';
}

function parseCouplingQuery(sp: URLSearchParams): CouplingQuery {
  const granularity = resolveGranularity(sp.get('granularity'));
  const isSession = granularity === 'session';
  return {
    granularity,
    directional: sp.get('directional') === 'true',
    windowDays: clampInt(sp.get('windowDays'), 30, 1, 365),
    topK: clampInt(sp.get('topK'), 50, 1, 500),
    minChangeCount: clampInt(sp.get('minChange'), isSession ? 3 : 5, 1, 1000),
    jaccardThreshold: clampFloat(sp.get('threshold'), isSession ? 0.4 : 0.5, 0, 1),
    confidenceThreshold: clampFloat(sp.get('confidenceThreshold'), 0.5, 0, 1),
    directionalDiff: clampFloat(sp.get('directionalDiff'), 0.3, 0, 1),
    maxFilesPerCommit: isSession ? 20 : 50,
  };
}

function emptyResponse(query: CouplingQuery, computedAt: string): NextResponse {
  return NextResponse.json(
    {
      ...(query.granularity === 'subagentType' ? { directional: query.directional } : {}),
      granularity: query.granularity,
      edges: [],
      computedAt,
      windowDays: query.windowDays,
      totalPairs: 0,
    },
    { headers: NO_STORE_HEADERS },
  );
}

// supabase の Database ジェネリクスを供給していないため、ヘルパでは any 受け入れ
async function fetchCommitHashToSessionId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fromIso: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let offset = 0; ; offset += 1000) {
    const { data: batch } = await supabase
      .from('trail_session_commits')
      .select('commit_hash,session_id,committed_at')
      .gte('committed_at', fromIso)
      .range(offset, offset + 999);
    if (!batch || batch.length === 0) break;
    for (const r of batch as Array<{ commit_hash: string; session_id: string; committed_at: string }>) {
      result.set(r.commit_hash, r.session_id);
    }
    if (batch.length < 1000) break;
  }
  return result;
}

async function fetchCommitFileRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  knownCommitHashes: Map<string, string>,
): Promise<CommitFileRow[]> {
  const result: CommitFileRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_commit_files')
      .select('commit_hash,file_path')
      .order('commit_hash')
      .order('file_path')
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ commit_hash: string; file_path: string }>) {
      if (knownCommitHashes.has(r.commit_hash)) {
        result.push({ commitHash: r.commit_hash, filePath: r.file_path });
      }
    }
    if (data.length < 1000) break;
  }
  return result;
}

function computeEdges(
  query: CouplingQuery,
  commitFileRows: readonly CommitFileRow[],
  commitHashToSessionId: Map<string, string>,
): unknown[] {
  const baseOpts = {
    minChangeCount: query.minChangeCount,
    jaccardThreshold: query.jaccardThreshold,
    topK: query.topK,
    maxFilesPerCommit: query.maxFilesPerCommit,
    pathFilter,
  };
  const confOpts = {
    minChangeCount: query.minChangeCount,
    confidenceThreshold: query.confidenceThreshold,
    directionalDiffThreshold: query.directionalDiff,
    topK: query.topK,
    maxFilesPerCommit: query.maxFilesPerCommit,
    pathFilter,
  };

  if (query.granularity === 'commit') {
    return query.directional
      ? computeConfidenceCoupling([...commitFileRows], confOpts)
      : computeTemporalCoupling([...commitFileRows], baseOpts);
  }

  const sessionFileRows: SessionFileRow[] = commitFileRows
    .map((r) => ({ sessionId: commitHashToSessionId.get(r.commitHash) ?? '', filePath: r.filePath }))
    .filter((r) => r.sessionId !== '');
  return query.directional
    ? computeSessionConfidenceCoupling(sessionFileRows, confOpts)
    : computeSessionCoupling(sessionFileRows, baseOpts);
}

/**
 * GET /api/temporal-coupling?repo=...&windowDays=...&topK=...&...
 *
 * trail_session_commits + trail_commit_files から Temporal Coupling を計算して返す。
 * パスフィルタは拡張機能と同一のブラックリスト方式（ロックファイル・生成物等を除外）。
 * granularity=subagentType はデータなし（activity_message_tool_calls は 7 日制限）→ 空配列。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = parseCouplingQuery(request.nextUrl.searchParams);
  const computedAt = new Date().toISOString();

  if (query.granularity === 'subagentType') return emptyResponse(query, computedAt);

  const env = resolveSupabaseEnv();
  if (!env) return emptyResponse(query, computedAt);

  try {
    const supabase = createClient(env.url, env.anonKey);
    const fromIso = new Date(Date.now() - query.windowDays * 86_400_000).toISOString();

    const commitHashToSessionId = await fetchCommitHashToSessionId(supabase, fromIso);
    if (commitHashToSessionId.size === 0) return emptyResponse(query, computedAt);

    const commitFileRows = await fetchCommitFileRows(supabase, commitHashToSessionId);
    const edges = computeEdges(query, commitFileRows, commitHashToSessionId);

    return NextResponse.json(
      {
        directional: query.directional || undefined,
        granularity: query.granularity,
        edges,
        computedAt,
        windowDays: query.windowDays,
        totalPairs: edges.length,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return emptyResponse(query, computedAt);
  }
}
