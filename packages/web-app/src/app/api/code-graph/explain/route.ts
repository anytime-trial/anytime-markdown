import type { CodeGraph, CodeGraphExplainResult, StoredCodeGraph, StoredCommunity } from '@anytime-markdown/trail-core/codeGraph';
import { composeCodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { NO_STORE_HEADERS } from '../../../../lib/api-helpers';
import { resolveSupabaseEnv } from '../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

function explainNode(graph: CodeGraph, nodeId: string): CodeGraphExplainResult | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const incoming = graph.edges.filter((e) => e.target === nodeId);
  const outgoing = graph.edges.filter((e) => e.source === nodeId);
  return { node, incoming, outgoing };
}

/**
 * GET /api/code-graph/explain?id=...
 *
 * 指定ノードの incoming/outgoing エッジとノード情報を返す。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse(null, { status: 404 });

  try {
    const supabase = createClient(env.url, env.anonKey);
    const [{ data: graphRow, error: graphErr }, { data: communityRows }] = await Promise.all([
      supabase.from('trail_current_code_graphs').select('graph_json').limit(1).single(),
      supabase.from('trail_current_code_graph_communities').select('community_id,label,name,summary').limit(1000),
    ]);

    if (graphErr || !graphRow) return new NextResponse(null, { status: 404 });

    const stored = JSON.parse(graphRow.graph_json as string) as StoredCodeGraph;
    const communities: StoredCommunity[] = (communityRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.community_id as number,
      label: (r.label as string) ?? '',
      name: (r.name as string) ?? '',
      summary: (r.summary as string) ?? '',
      stableKey: (r.stable_key as string) ?? '',
    }));

    const graph = composeCodeGraph(stored, communities);
    const result = explainNode(graph, id);
    if (!result) return new NextResponse(null, { status: 404 });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
