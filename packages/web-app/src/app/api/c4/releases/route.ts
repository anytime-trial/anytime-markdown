import { NextResponse } from "next/server";

import { fetchC4ModelEntries } from "@anytime-markdown/trail-core/c4";
import { SupabaseC4ModelStore } from "@anytime-markdown/trail-viewer/supabase";

import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

/**
 * GET /api/c4/releases
 *
 * current + release の C4 モデルエントリ一覧を返す。
 * 返却形状: Array<{ tag: string; repoName: string | null }>
 *
 * 拡張機能の /api/c4/releases と互換。web アプリは Supabase を使用する。
 */

export async function GET(): Promise<NextResponse> {
  const env = resolveSupabaseEnv();
  if (!env) {
    console.warn('[/api/c4/releases] Supabase env not configured');
    return NextResponse.json([]);
  }

  try {
    const store = new SupabaseC4ModelStore(env.url, env.anonKey);
    const entries = await fetchC4ModelEntries(store);
    console.info(`[/api/c4/releases] returned ${entries.length} entries`);
    return NextResponse.json(entries);
  } catch (e) {
    console.error('[/api/c4/releases] error', e);
    return NextResponse.json([]);
  }
}
