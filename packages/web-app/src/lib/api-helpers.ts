// packages/web-app/src/lib/api-helpers.ts
//
// /api/* ルートで共通利用する小さなヘルパ群。
// noStore ヘッダ、SupabaseTrailReader を使った薄いラッパー、SupabaseC4ModelStore 生成。

import { SupabaseC4ModelStore, SupabaseTrailReader } from '@anytime-markdown/trail-viewer/supabase';
import { NextResponse } from 'next/server';

import { resolveSupabaseEnv } from './supabase-env';

/** Cache-Control: no-store ヘッダ。Next.js のレスポンスキャッシュとブラウザキャッシュを抑止する。 */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, must-revalidate',
};

/**
 * SupabaseTrailReader を使う /api/trail/* ルートのテンプレート。
 * env 未設定なら fallback を返し、例外時もログ + fallback を返す。
 */
export async function trailReaderRoute<T>(
  fetcher: (reader: SupabaseTrailReader) => Promise<T>,
  fallback: T,
  label: string,
): Promise<NextResponse> {
  const env = resolveSupabaseEnv();
  if (!env) {
    return NextResponse.json(fallback, { headers: NO_STORE_HEADERS });
  }
  try {
    const reader = new SupabaseTrailReader(env.url, env.anonKey);
    const data = await fetcher(reader);
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error(`[${label}] error`, e);
    return NextResponse.json(fallback, { headers: NO_STORE_HEADERS });
  }
}

/** SupabaseC4ModelStore を env から生成する。env 未設定時は null。 */
export function createC4ModelStore(): SupabaseC4ModelStore | null {
  const env = resolveSupabaseEnv();
  return env ? new SupabaseC4ModelStore(env.url, env.anonKey) : null;
}
