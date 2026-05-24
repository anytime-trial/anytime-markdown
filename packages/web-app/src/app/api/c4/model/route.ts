import type { CommunityRow, ManualElement, ManualRelationship } from "@anytime-markdown/trail-core/c4";
import { buildFeatureMatrixFromCommunities, fetchC4Model, mergeManualIntoC4Model } from "@anytime-markdown/trail-core/c4";
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore,NO_STORE_HEADERS, resolveRepoId } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

/**
 * GET /api/c4/model?release=...&repo=...
 *
 * 拡張機能の TrailDataServer の /api/c4/model と互換のエンドポイント。
 * 返却形状: { model, boundaries, featureMatrix?, commitId? } | 204 No Content
 *
 * Supabase 専用エンドポイント。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get("release") ?? "current";
  const repo = request.nextUrl.searchParams.get("repo") ?? undefined;

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const payload = await fetchC4Model(store, release, repo);
    if (!payload) return new NextResponse(null, { status: 204 });

    if (repo && release === 'current') {
      const env = resolveSupabaseEnv();
      if (env) {
        const supabase = createClient(env.url, env.anonKey);
        // 各テーブルは repo_id キー。repo_name → repo_id を解決する (未登録なら merge せず base を返す)。
        const repoId = await resolveRepoId(supabase, repo);
        if (repoId == null) return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
        const [{ data: elements }, { data: rels }, { data: communities }] = await Promise.all([
          supabase.from('trail_c4_manual_elements').select('*').eq('repo_id', repoId),
          supabase.from('trail_c4_manual_relationships').select('*').eq('repo_id', repoId),
          supabase.from('trail_current_code_graph_communities').select('community_id,name,label,mappings_json').eq('repo_id', repoId),
        ]);
        const manualElements: ManualElement[] = (elements ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.element_id),
          type: String(row.type) as ManualElement['type'],
          name: String(row.name),
          description: row.description == null ? undefined : String(row.description),
          external: Boolean(row.external),
          parentId: row.parent_id == null ? null : String(row.parent_id),
          updatedAt: String(row.updated_at),
        }));
        const manualRels: ManualRelationship[] = (rels ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.rel_id),
          fromId: String(row.from_id),
          toId: String(row.to_id),
          label: row.label == null ? undefined : String(row.label),
          technology: row.technology == null ? undefined : String(row.technology),
          updatedAt: String(row.updated_at),
        }));
        const communityRows: CommunityRow[] = (communities ?? []).map((c: Record<string, unknown>) => ({
          community_id: Number(c.community_id ?? 0),
          name: String(c.name ?? ''),
          label: String(c.label ?? ''),
          mappings_json: c.mappings_json == null ? null : String(c.mappings_json),
        }));
        const featureMatrix = buildFeatureMatrixFromCommunities(communityRows);
        const mergedModel = mergeManualIntoC4Model(payload.model, manualElements, manualRels);
        const responsePayload: Record<string, unknown> = { ...payload, model: mergedModel };
        if (featureMatrix) responsePayload.featureMatrix = featureMatrix;
        return NextResponse.json(responsePayload, { headers: NO_STORE_HEADERS });
      }
    }

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/model] error', e);
    return new NextResponse(null, { status: 204 });
  }
}
