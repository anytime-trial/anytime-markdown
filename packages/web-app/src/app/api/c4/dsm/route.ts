import { buildSourceMatrix } from "@anytime-markdown/trail-core/c4";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore,NO_STORE_HEADERS } from "../../../../lib/api-helpers";

/**
 * GET /api/c4/dsm?release=...&repo=...
 *
 * 拡張機能の TrailDataServer の /api/c4/dsm と互換のエンドポイント。
 * Supabase の TrailGraph から buildSourceMatrix() で DSM を計算して返す。
 * 返却形状: { matrix } | 204 No Content
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get("release") ?? "current";
  const repo = request.nextUrl.searchParams.get("repo") ?? undefined;

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const graph = release === 'current'
      ? (await store.getCurrentGraph(repo ?? ''))?.graph ?? null
      : await store.getReleaseGraph(release);
    if (!graph) return new NextResponse(null, { status: 204 });

    const matrix = buildSourceMatrix(graph, 'component');
    return NextResponse.json({ matrix }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/dsm] error', e);
    return new NextResponse(null, { status: 204 });
  }
}
