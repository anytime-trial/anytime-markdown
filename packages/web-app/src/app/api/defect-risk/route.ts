import type { CommitRiskRow } from '@anytime-markdown/trail-core';
import { computeDefectRisk } from '@anytime-markdown/trail-core';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NO_STORE_HEADERS } from '../../../lib/api-helpers';
import { resolveSupabaseEnv } from '../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const v = raw === null ? def : Number.parseInt(raw, 10);
  return Number.isNaN(v) ? def : Math.min(max, Math.max(min, v));
}

function emptyResponse(windowDays: number, halfLifeDays: number, computedAt: string): NextResponse {
  return NextResponse.json(
    { entries: [], computedAt, windowDays, halfLifeDays, totalFiles: 0 },
    { headers: NO_STORE_HEADERS },
  );
}

interface SessionCommitRow {
  commit_hash: string;
  session_id: string;
  commit_message: string | null;
  committed_at: string;
}

interface CommitFileRow {
  commit_hash: string;
  file_path: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSessionCommits(supabase: any, fromIso: string): Promise<SessionCommitRow[]> {
  const result: SessionCommitRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_session_commits')
      .select('commit_hash,session_id,commit_message,committed_at')
      .gte('committed_at', fromIso)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as SessionCommitRow[]) result.push(r);
    if (data.length < 1000) break;
  }
  return result;
}

async function fetchCommitFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  knownCommitHashes: ReadonlySet<string>,
): Promise<CommitFileRow[]> {
  const result: CommitFileRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_commit_files')
      .select('commit_hash,file_path')
      .order('commit_hash')
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as CommitFileRow[]) {
      if (knownCommitHashes.has(r.commit_hash)) result.push(r);
    }
    if (data.length < 1000) break;
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSessionIdsForRepo(supabase: any, repo: string): Promise<Set<string>> {
  const result = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_sessions')
      .select('id')
      .eq('repo_name', repo)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ id: string }>) result.add(r.id);
    if (data.length < 1000) break;
  }
  return result;
}

/**
 * GET /api/defect-risk?windowDays=...&halfLifeDays=...&repo=...
 *
 * 拡張機能 TrailDataServer の /api/defect-risk と互換。
 * Supabase の trail_session_commits + trail_commit_files から CommitRiskRow を構築し、
 * computeDefectRisk で 0..1 正規化スコアを算出して返す。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const windowDays = clampInt(sp.get('windowDays'), 90, 1, 365);
  const halfLifeDays = clampInt(sp.get('halfLifeDays'), 90, 1, 730);
  const repo = sp.get('repo') ?? undefined;
  const computedAt = new Date().toISOString();

  const env = resolveSupabaseEnv();
  if (!env) return emptyResponse(windowDays, halfLifeDays, computedAt);

  try {
    const supabase = createClient(env.url, env.anonKey);
    const fromIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();

    const sessionCommits = await fetchSessionCommits(supabase, fromIso);
    if (sessionCommits.length === 0) return emptyResponse(windowDays, halfLifeDays, computedAt);

    let scopedCommits = sessionCommits;
    if (repo) {
      const sessionIds = await fetchSessionIdsForRepo(supabase, repo);
      scopedCommits = sessionCommits.filter((r) => sessionIds.has(r.session_id));
      if (scopedCommits.length === 0) return emptyResponse(windowDays, halfLifeDays, computedAt);
    }

    const commitInfo = new Map<string, { commitMessage: string; committedAt: string }>();
    for (const r of scopedCommits) {
      commitInfo.set(r.commit_hash, {
        commitMessage: r.commit_message ?? '',
        committedAt: r.committed_at,
      });
    }

    const commitFiles = await fetchCommitFiles(supabase, new Set(commitInfo.keys()));
    const rows: CommitRiskRow[] = [];
    for (const cf of commitFiles) {
      const info = commitInfo.get(cf.commit_hash);
      if (!info || !cf.file_path) continue;
      rows.push({
        commitHash: cf.commit_hash,
        filePath: cf.file_path,
        commitMessage: info.commitMessage,
        committedAt: info.committedAt,
      });
    }

    const entries = computeDefectRisk(rows, { halfLifeDays });
    return NextResponse.json(
      { entries, computedAt, windowDays, halfLifeDays, totalFiles: entries.length },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    console.error('[/api/defect-risk] error', e);
    return emptyResponse(windowDays, halfLifeDays, computedAt);
  }
}
