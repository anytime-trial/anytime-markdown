import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fetchC4Model } from "@anytime-markdown/trail-core/c4";
import { SupabaseC4ModelStore } from "@anytime-markdown/trail-viewer/supabase";

import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

// Next.js App Router のデフォルト GET キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/c4/model?release=...&repo=...
 *
 * 拡張機能の TrailDataServer の /api/c4/model と互換のエンドポイント。
 * 返却形状: { model, boundaries, featureMatrix?, commitId? } | 204 No Content
 *
 * Supabase 専用（GitHub フォールバックは従来の /api/c4model を利用する）。
 */

const CACHE_MAX_AGE = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get("release") ?? "current";
  const repo = request.nextUrl.searchParams.get("repo") ?? undefined;

  const env = resolveSupabaseEnv();
  if (!env) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const store = new SupabaseC4ModelStore(env.url, env.anonKey);
    const payload = await fetchC4Model(store, release, repo);
    if (!payload) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
