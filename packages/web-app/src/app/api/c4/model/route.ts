import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fetchC4Model } from "@anytime-markdown/trail-core/c4";

import { NO_STORE_HEADERS, createC4ModelStore } from "../../../../lib/api-helpers";

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
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/model] error', e);
    return new NextResponse(null, { status: 204 });
  }
}
