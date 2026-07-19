// packages/web-app/src/lib/api-helpers.ts
//
// /api/* ルートで共通利用する小さなヘルパ群。
// noStore ヘッダ、SupabaseTrailReader を使った薄いラッパー、SupabaseC4ModelStore 生成。

import { SupabaseC4ModelStore, SupabaseTrailReader } from '@anytime-markdown/trail-viewer/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { RouteCache, resolveTrailApiCacheTtlMs } from './route-cache';
import { resolveSupabaseEnv } from './supabase-env';

/**
 * repo_name → repo_id を解決する。trail_* テーブルは repo_id 正規化済のため、
 * repo 名でフィルタする前に repo_id へ解決する。未登録は null (= 結果なし)。
 */
export async function resolveRepoId(supabase: SupabaseClient, repoName: string): Promise<number | null> {
  const { data } = await supabase
    .from('trail_repos')
    .select('repo_id')
    .eq('repo_name', repoName)
    .maybeSingle<{ repo_id: number }>();
  return data?.repo_id ?? null;
}

/**
 * tag → release_id を解決する。release 系は release_id 正規化済。
 * repoId 指定時は (repo_id, tag) で一意化する (UNIQUE(repo_id, tag))。未登録は null。
 */
export async function resolveReleaseId(
  supabase: SupabaseClient,
  tag: string,
  repoId?: number | null,
): Promise<number | null> {
  let q = supabase.from('trail_releases').select('release_id').eq('tag', tag);
  if (repoId != null) q = q.eq('repo_id', repoId);
  const { data } = await q.limit(1).overrideTypes<{ release_id: number }[], { merge: false }>();
  return data?.[0]?.release_id ?? null;
}

/** unknown 型の catch 値からエラーメッセージ文字列を取得する。 */
export function extractErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

/** Cache-Control: no-store ヘッダ。Next.js のレスポンスキャッシュとブラウザキャッシュを抑止する。 */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, must-revalidate',
};

// Supabase egress 対策のサーバー内 TTL キャッシュ（成功応答のみ格納）。
// ブラウザ向けの no-store は維持し、再利用はこのプロセス内に限定する。
const trailRouteCache = new RouteCache<unknown>({
  ttlMs: resolveTrailApiCacheTtlMs(),
  maxEntries: 50,
});

/** テスト用: trail ルートキャッシュを全消去する。 */
export function clearTrailRouteCache(): void {
  trailRouteCache.clear();
}

/**
 * SupabaseTrailReader を使う /api/trail/* ルートのテンプレート。
 * env 未設定なら fallback を返し、例外時もログ + fallback を返す。
 * cacheKey 指定時は成功応答を TTL キャッシュへ格納し、期間内の同一キーは
 * Supabase を読まずに返す（フォールバック応答は障害の固着を防ぐため格納しない）。
 */
export async function trailReaderRoute<T>(
  fetcher: (reader: SupabaseTrailReader) => Promise<T>,
  fallback: T,
  label: string,
  cacheKey?: string,
): Promise<NextResponse> {
  const env = resolveSupabaseEnv();
  if (!env) {
    return NextResponse.json(fallback, { headers: NO_STORE_HEADERS });
  }
  if (cacheKey !== undefined) {
    const cached = trailRouteCache.get(cacheKey);
    if (cached !== undefined) {
      return NextResponse.json(cached as T, { headers: NO_STORE_HEADERS });
    }
  }
  try {
    const reader = new SupabaseTrailReader(env.url, env.anonKey);
    const data = await fetcher(reader);
    if (cacheKey !== undefined) {
      trailRouteCache.set(cacheKey, data);
    }
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
