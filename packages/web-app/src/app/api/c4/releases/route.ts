import { fetchC4ModelEntries } from "@anytime-markdown/trail-core/c4";
import { NextResponse } from "next/server";

import { createC4ModelStore,NO_STORE_HEADERS } from "../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/c4/releases
 *
 * 拡張機能の /api/c4/releases と互換。current + release エントリ一覧を返す。
 * 返却形状: Array<{ tag: string; repoName: string | null }>
 */
export async function GET(): Promise<NextResponse> {
  const store = createC4ModelStore();
  if (!store) return NextResponse.json([], { headers: NO_STORE_HEADERS });

  try {
    const entries = await fetchC4ModelEntries(store);
    return NextResponse.json(entries, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/releases] error', e);
    return NextResponse.json([], { headers: NO_STORE_HEADERS });
  }
}
