/**
 * RouteCache（trail 系 API ルートの in-memory TTL キャッシュ）のユニットテスト
 */
import { RouteCache, resolveTrailApiCacheTtlMs } from '../lib/route-cache';

describe('RouteCache', () => {
  it('TTL 内は set した値を返す', () => {
    let now = 1_000;
    const cache = new RouteCache<string>({ ttlMs: 100, maxEntries: 10, now: () => now });
    cache.set('k', 'v');
    now = 1_099;
    expect(cache.get('k')).toBe('v');
  });

  it('TTL 経過後は undefined を返す', () => {
    let now = 1_000;
    const cache = new RouteCache<string>({ ttlMs: 100, maxEntries: 10, now: () => now });
    cache.set('k', 'v');
    now = 1_101;
    expect(cache.get('k')).toBeUndefined();
  });

  it('ttlMs=0 は無効化（set しても返さない）', () => {
    const cache = new RouteCache<string>({ ttlMs: 0, maxEntries: 10, now: () => 0 });
    cache.set('k', 'v');
    expect(cache.get('k')).toBeUndefined();
    expect(cache.enabled).toBe(false);
  });

  it('maxEntries 超過時は最古エントリから追い出す', () => {
    const cache = new RouteCache<number>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('同一キーの再 set は値を更新し追い出し順も更新する', () => {
    const cache = new RouteCache<number>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(10);
  });

  it('null 値もキャッシュできる（undefined と区別する）', () => {
    const cache = new RouteCache<null>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
    cache.set('k', null);
    expect(cache.get('k')).toBeNull();
  });

  it('clear で全消去する', () => {
    const cache = new RouteCache<number>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
    cache.set('a', 1);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('resolveTrailApiCacheTtlMs', () => {
  it('未設定なら既定 10 分', () => {
    expect(resolveTrailApiCacheTtlMs({})).toBe(600_000);
  });

  it('数値文字列を採用する（0 = 無効化も可）', () => {
    expect(resolveTrailApiCacheTtlMs({ TRAIL_API_CACHE_TTL_MS: '30000' })).toBe(30_000);
    expect(resolveTrailApiCacheTtlMs({ TRAIL_API_CACHE_TTL_MS: '0' })).toBe(0);
  });

  it('不正値（非数値・負値・空文字）は既定へフォールバック', () => {
    expect(resolveTrailApiCacheTtlMs({ TRAIL_API_CACHE_TTL_MS: 'abc' })).toBe(600_000);
    expect(resolveTrailApiCacheTtlMs({ TRAIL_API_CACHE_TTL_MS: '-1' })).toBe(600_000);
    expect(resolveTrailApiCacheTtlMs({ TRAIL_API_CACHE_TTL_MS: ' ' })).toBe(600_000);
  });
});
