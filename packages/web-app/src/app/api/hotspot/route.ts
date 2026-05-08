import type { FileHotspotRow, HotspotGranularity, TrendPeriod } from '@anytime-markdown/trail-core/c4';
import { computeFileHotspot } from '@anytime-markdown/trail-core/c4';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NO_STORE_HEADERS } from '../../../lib/api-helpers';
import { resolveSupabaseEnv } from '../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

const PERIODS: readonly TrendPeriod[] = ['7d', '30d', '90d', 'all'];
const GRANULARITIES: readonly HotspotGranularity[] = ['commit', 'session'];
const ALL_PERIOD_FROM = '1970-01-01T00:00:00.000Z';
const MS_PER_DAY = 86_400_000;
const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const;

function parsePeriod(raw: string | null): TrendPeriod | null {
  if (raw === null) return '30d';
  return PERIODS.includes(raw as TrendPeriod) ? (raw as TrendPeriod) : null;
}

function parseGranularity(raw: string | null): HotspotGranularity | null {
  if (raw === null) return 'commit';
  return GRANULARITIES.includes(raw as HotspotGranularity) ? (raw as HotspotGranularity) : null;
}

function computePeriodRange(period: TrendPeriod): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (period === 'all') return { from: ALL_PERIOD_FROM, to };
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * MS_PER_DAY).toISOString();
  return { from, to };
}

function emptyResponse(period: TrendPeriod, granularity: HotspotGranularity, from: string, to: string): NextResponse {
  return NextResponse.json(
    { period, granularity, from, to, files: [] as readonly FileHotspotRow[] },
    { headers: NO_STORE_HEADERS },
  );
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

async function fetchCommitGranularityRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  from: string,
  to: string,
  repo: string | undefined,
): Promise<FileHotspotRow[]> {
  const repoSessionIds = repo ? await fetchSessionIdsForRepo(supabase, repo) : null;

  const knownCommitHashes = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_session_commits')
      .select('commit_hash,session_id,committed_at')
      .gte('committed_at', from)
      .lte('committed_at', to)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ commit_hash: string; session_id: string }>) {
      if (!repoSessionIds || repoSessionIds.has(r.session_id)) {
        knownCommitHashes.add(r.commit_hash);
      }
    }
    if (data.length < 1000) break;
  }
  if (knownCommitHashes.size === 0) return [];

  // file_path × distinct commit_hash でカウント
  const fileToCommits = new Map<string, Set<string>>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_commit_files')
      .select('commit_hash,file_path')
      .order('commit_hash')
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ commit_hash: string; file_path: string }>) {
      if (!r.file_path || !knownCommitHashes.has(r.commit_hash)) continue;
      let set = fileToCommits.get(r.file_path);
      if (!set) {
        set = new Set();
        fileToCommits.set(r.file_path, set);
      }
      set.add(r.commit_hash);
    }
    if (data.length < 1000) break;
  }

  const rows: FileHotspotRow[] = [];
  for (const [filePath, hashes] of fileToCommits) {
    rows.push({ filePath, churn: hashes.size });
  }
  return rows;
}

async function fetchToolCallGranularityRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  from: string,
  to: string,
  repo: string | undefined,
): Promise<FileHotspotRow[]> {
  const repoSessionIds = repo ? await fetchSessionIdsForRepo(supabase, repo) : null;

  const fileChurn = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('trail_message_tool_calls')
      .select('session_id,file_path,timestamp,tool_name,message_uuid')
      .gte('timestamp', from)
      .lte('timestamp', to)
      .in('tool_name', [...EDIT_TOOLS])
      .not('file_path', 'is', null)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ session_id: string; file_path: string; message_uuid: string }>) {
      if (!r.file_path) continue;
      if (repoSessionIds && !repoSessionIds.has(r.session_id)) continue;
      fileChurn.set(r.file_path, (fileChurn.get(r.file_path) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  const rows: FileHotspotRow[] = [];
  for (const [filePath, churn] of fileChurn) rows.push({ filePath, churn });
  return rows;
}

/**
 * GET /api/hotspot?period=...&granularity=...&repo=...
 *
 * 拡張機能 TrailDataServer の /api/hotspot と互換。
 * granularity に応じて trail_session_commits / trail_message_tool_calls から
 * file_path 単位の churn を集計し、computeFileHotspot で正規化して返す。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const period = parsePeriod(sp.get('period'));
  if (period === null) {
    return NextResponse.json(
      { error: "period must be one of '7d', '30d', '90d', or 'all'" },
      { status: 400 },
    );
  }
  const granularity = parseGranularity(sp.get('granularity'));
  if (granularity === null) {
    return NextResponse.json(
      { error: "granularity must be one of 'commit' or 'session'" },
      { status: 400 },
    );
  }
  const repo = sp.get('repo') ?? undefined;
  const { from, to } = computePeriodRange(period);

  const env = resolveSupabaseEnv();
  if (!env) return emptyResponse(period, granularity, from, to);

  try {
    const supabase = createClient(env.url, env.anonKey);
    let rows: FileHotspotRow[];
    if (granularity === 'commit') {
      rows = await fetchCommitGranularityRows(supabase, from, to, repo);
    } else {
      rows = await fetchToolCallGranularityRows(supabase, from, to, repo);
    }
    const files = computeFileHotspot(rows);
    return NextResponse.json(
      { period, granularity, from, to, files },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    console.error('[/api/hotspot] error', e);
    return emptyResponse(period, granularity, from, to);
  }
}
