import type { TrailGraph } from "@anytime-markdown/trail-core";
import type { TrailNode } from "@anytime-markdown/trail-core/model";
import {
  buildCallHierarchyNodeFilter,
  buildIndex as buildCallHierarchyIndex,
  traverse as traverseCallHierarchy,
} from "@anytime-markdown/trail-core/c4/callHierarchy";
import type {
  CallHierarchyDirection,
  CallHierarchyScope,
} from "@anytime-markdown/trail-core/c4/callHierarchy";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

/**
 * GET /api/c4/call-hierarchy?file=...&fn=...&direction=callers|callees&depth=N&line=N&repo=
 *
 * 拡張機能の同名エンドポイントと互換。
 * Supabase の trail_current_graphs から graph_json を読み、
 * CallHierarchyService の buildIndex + traverse でツリーを返す。
 *
 * graph_json は 1 リクエストにつき 1 回 parse する (関数毎キャッシュは効かないが、
 * 4,075 call edges 程度の規模ならミリ秒オーダーで完了する)。
 */

function clampDepth(value: string | null): number {
  const fallback = 1;
  if (value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 0), 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const file = request.nextUrl.searchParams.get('file') ?? '';
  const fn = request.nextUrl.searchParams.get('fn') ?? '';
  const direction = request.nextUrl.searchParams.get('direction') ?? 'callees';
  const depth = clampDepth(request.nextUrl.searchParams.get('depth'));
  const lineParam = request.nextUrl.searchParams.get('line');
  const repoParam = request.nextUrl.searchParams.get('repo') ?? undefined;
  const scope = request.nextUrl.searchParams.get('scope') ?? 'project';
  const excludeTests = request.nextUrl.searchParams.get('excludeTests') === 'true';

  if (!file || !fn) {
    return NextResponse.json(
      { error: 'file and fn query params are required' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (direction !== 'callers' && direction !== 'callees') {
    return NextResponse.json(
      { error: 'direction must be callers or callees' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (scope !== 'project' && scope !== 'package' && scope !== 'file') {
    return NextResponse.json(
      { error: 'scope must be project, package, or file' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const env = resolveSupabaseEnv();
  if (!env) {
    return NextResponse.json(
      { error: 'graph not available' },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const supabase = createClient(env.url, env.anonKey);

    let query = supabase.from('trail_current_graphs').select('graph_json').limit(1);
    if (repoParam) {
      query = query.eq('repo_name', repoParam);
    }
    const { data, error } = await query.maybeSingle<{ graph_json: string }>();
    if (error || !data?.graph_json) {
      return NextResponse.json(
        { error: 'graph not available' },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const graph = JSON.parse(data.graph_json) as TrailGraph;
    const index = buildCallHierarchyIndex({ nodes: graph.nodes, edges: graph.edges });

    const requestedLine = lineParam !== null && lineParam !== '' ? Number.parseInt(lineParam, 10) : undefined;
    let target: TrailNode | undefined;
    let fallback: TrailNode | undefined;
    for (const node of index.nodes.values()) {
      if (node.type !== 'function') continue;
      if (node.filePath !== file) continue;
      if (node.label !== fn) continue;
      if (typeof requestedLine === 'number' && Number.isFinite(requestedLine)) {
        if (node.line === requestedLine) {
          target = node;
          break;
        }
        fallback ??= node;
      } else {
        target = node;
        break;
      }
    }
    target ??= fallback;

    if (!target) {
      return NextResponse.json(
        { error: 'function not found', file, fn },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const nodeFilter = buildCallHierarchyNodeFilter({
      scope: scope as CallHierarchyScope,
      excludeTests,
      rootFilePath: target.filePath,
    });
    const tree = traverseCallHierarchy(
      index,
      target.id,
      direction as CallHierarchyDirection,
      depth,
      nodeFilter ? { nodeFilter } : undefined,
    );
    if (!tree) {
      return NextResponse.json(
        { error: 'function not in index' },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(tree, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/call-hierarchy] error', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
