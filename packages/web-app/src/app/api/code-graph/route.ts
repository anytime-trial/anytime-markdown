import type { StoredCodeGraph, StoredCommunity } from '@anytime-markdown/trail-core/codeGraph';
import { composeCodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NO_STORE_HEADERS } from '../../../lib/api-helpers';
import { resolveSupabaseEnv } from '../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/code-graph?release=&repo=
 *
 * release === 'current' のときは trail_current_code_graphs + trail_current_code_graph_communities を、
 * 特定タグのときは trail_releases.repo_name で repo 帰属を確認のうえ
 * trail_release_code_graphs + trail_release_code_graph_communities を返す。
 *
 * コードグラフは repo 単位で個別保存されるため、repo 指定時は repo_name で絞り込む。
 * repo 未指定時は先頭 1 件にフォールバックする（単一リポ環境・後方互換）。
 *
 * グラフ未生成時または tag が repo に属さない場合は 404。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get('release') ?? 'current';
  const repo = request.nextUrl.searchParams.get('repo') ?? undefined;

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse(null, { status: 404 });

  try {
    const supabase = createClient(env.url, env.anonKey);
    const result = release === 'current'
      ? await fetchCurrent(supabase, repo)
      : await fetchRelease(supabase, release, repo);
    if (!result) return new NextResponse(null, { status: 404 });

    const graph = composeCodeGraph(result.stored, result.communities);
    return NextResponse.json(graph, { headers: NO_STORE_HEADERS });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

interface FetchedGraph {
  stored: StoredCodeGraph;
  communities: StoredCommunity[];
}

async function fetchCurrent(
  supabase: SupabaseClient,
  repo: string | undefined,
): Promise<FetchedGraph | null> {
  let graphQuery = supabase.from('trail_current_code_graphs').select('graph_json');
  let communityQuery = supabase
    .from('trail_current_code_graph_communities')
    .select('community_id,label,name,summary');
  if (repo) {
    graphQuery = graphQuery.eq('repo_name', repo);
    communityQuery = communityQuery.eq('repo_name', repo);
  }
  const [{ data: graphRow, error: graphErr }, { data: communityRows }] = await Promise.all([
    graphQuery.limit(1).single(),
    communityQuery.limit(1000),
  ]);
  if (graphErr || !graphRow) return null;
  return {
    stored: JSON.parse(graphRow.graph_json as string) as StoredCodeGraph,
    communities: (communityRows ?? []).map(toStoredCommunity),
  };
}

async function fetchRelease(
  supabase: SupabaseClient,
  release: string,
  repo: string | undefined,
): Promise<FetchedGraph | null> {
  if (!repo) return null;
  // 1. tag が repo に属するか確認
  const { data: tagRow } = await supabase
    .from('trail_releases')
    .select('tag')
    .eq('tag', release)
    .eq('repo_name', repo)
    .limit(1)
    .maybeSingle<{ tag: string }>();
  if (!tagRow) return null;

  // 2. release_code_graphs / communities を取得
  const [{ data: graphRow, error: graphErr }, { data: communityRows }] = await Promise.all([
    supabase.from('trail_release_code_graphs').select('graph_json').eq('release_tag', release).limit(1).single(),
    supabase.from('trail_release_code_graph_communities').select('community_id,label,name,summary').eq('release_tag', release).limit(1000),
  ]);
  if (graphErr || !graphRow) return null;
  return {
    stored: JSON.parse(graphRow.graph_json as string) as StoredCodeGraph,
    communities: (communityRows ?? []).map(toStoredCommunity),
  };
}

function toStoredCommunity(r: Record<string, unknown>): StoredCommunity {
  return {
    id: r.community_id as number,
    label: (r.label as string) ?? '',
    name: (r.name as string) ?? '',
    summary: (r.summary as string) ?? '',
    stableKey: (r.stable_key as string) ?? '',
  };
}
