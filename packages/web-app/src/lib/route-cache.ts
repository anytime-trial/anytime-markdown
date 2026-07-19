// packages/web-app/src/lib/route-cache.ts
//
// trail 系 /api ルート用の in-memory TTL キャッシュ。
// Supabase egress 超過対策（proposal/20260719-supabase-egress-reduction.ja.md 第 1 段）:
// dev のリロード・HMR ごとに同一データを Supabase から全再取得する構造を、
// サーバープロセス内での再利用で断つ。ブラウザ側キャッシュ（no-store）は変更しない。
//
// SHORTCUT: プロセス内 Map で実装. ceiling: インスタンス毎キャッシュ（Netlify Functions では
// インスタンス間で共有されない）. upgrade: 本番の残存 egress が月 2GB を超えたら第 2 段
// （サーバー側集計化）へ移行する.

export interface RouteCacheOptions {
  /** 有効期間 (ms)。0 以下でキャッシュ無効。 */
  readonly ttlMs: number;
  /** 保持する最大エントリ数。超過時は最古（挿入順）から追い出す。 */
  readonly maxEntries: number;
  /** 時計注入（テスト用）。省略時は Date.now。 */
  readonly now?: () => number;
}

interface CacheEntry<T> {
  readonly expiresAt: number;
  readonly value: T;
}

export class RouteCache<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: RouteCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
    this.now = options.now ?? Date.now;
  }

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  /** TTL 内のエントリを返す。期限切れは削除して undefined。 */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** 値を格納する。無効時は no-op。既存キーは挿入順も更新する。 */
  set(key: string, value: T): void {
    if (!this.enabled) return;
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
  }

  clear(): void {
    this.entries.clear();
  }
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * TTL を環境変数 TRAIL_API_CACHE_TTL_MS から解決する。
 * 未設定・不正値（非数値・負値）は既定 10 分。'0' は明示的な無効化。
 */
export function resolveTrailApiCacheTtlMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRAIL_API_CACHE_TTL_MS;
  if (raw == null || raw.trim() === '') return DEFAULT_TTL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TTL_MS;
  return n;
}
