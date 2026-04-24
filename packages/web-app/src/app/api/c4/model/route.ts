import type { ManualElement, ManualRelationship } from "@anytime-markdown/trail-core/c4";
import { fetchC4Model, mergeManualIntoC4Model } from "@anytime-markdown/trail-core/c4";
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore,NO_STORE_HEADERS } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        const [{ data: elements }, { data: rels }] = await Promise.all([
          supabase.from('trail_c4_manual_elements').select('*').eq('repo_name', repo),
          supabase.from('trail_c4_manual_relationships').select('*').eq('repo_name', repo),
        ]);
        const manualElements: ManualElement[] = (elements ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.element_id),
          type: String(row.type) as ManualElement['type'],
          name: String(row.name),
          description: row.description != null ? String(row.description) : undefined,
          external: Boolean(row.external),
          parentId: row.parent_id != null ? String(row.parent_id) : null,
          updatedAt: String(row.updated_at),
        }));
        const manualRels: ManualRelationship[] = (rels ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.rel_id),
          fromId: String(row.from_id),
          toId: String(row.to_id),
          label: row.label != null ? String(row.label) : undefined,
          technology: row.technology != null ? String(row.technology) : undefined,
          updatedAt: String(row.updated_at),
        }));
        const mergedModel = mergeManualIntoC4Model(payload.model, manualElements, manualRels);
        return NextResponse.json({ ...payload, model: mergedModel }, { headers: NO_STORE_HEADERS });
      }
    }

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/model] error', e);
    return new NextResponse(null, { status: 204 });
  }
}
