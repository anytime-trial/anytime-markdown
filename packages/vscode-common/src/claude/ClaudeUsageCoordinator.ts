import { ClaudeUsageCache, type ClaudeUsageCacheReadResult } from './ClaudeUsageCache';
import type { ClaudeUsageClient, ClaudeUsageResult } from './ClaudeUsageClient';
import type { UsageLimitRow } from './parseClaudeUsage';
import type { ClaudeUsageSnapshot } from './types';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const BACKOFF_MINUTES = [5, 10, 20, 40, 60] as const;

export type ClaudeUsageRefreshResult =
  | {
      readonly kind: 'fresh';
      readonly rows: readonly UsageLimitRow[];
      readonly fetchedAt: string;
      readonly backoffUntil: null;
      readonly failureCount: 0;
      readonly unknownKinds: readonly string[];
      readonly cacheWarning?: string;
    }
  | {
      readonly kind: 'stale';
      readonly rows: readonly UsageLimitRow[];
      readonly fetchedAt: string;
      readonly backoffUntil: string | null;
      readonly failureCount: number;
      readonly message: string;
      readonly cacheWarning?: string;
    }
  | {
      readonly kind: 'rateLimited';
      readonly rows: readonly UsageLimitRow[];
      readonly fetchedAt: string | null;
      readonly backoffUntil: string;
      readonly failureCount: number;
      readonly cacheWarning?: string;
    }
  | { readonly kind: 'hidden'; readonly cacheWarning?: string }
  | { readonly kind: 'expired'; readonly rows: readonly UsageLimitRow[]; readonly cacheWarning?: string }
  | {
      readonly kind: 'error';
      readonly rows: readonly UsageLimitRow[];
      readonly fetchedAt: string | null;
      readonly message: string;
      readonly cacheWarning?: string;
    };

export interface ClaudeUsageCoordinatorOptions {
  readonly cachePath: string;
  readonly client: Pick<ClaudeUsageClient, 'fetchUsage'>;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

function cacheWarning(readResult: ClaudeUsageCacheReadResult): string | undefined {
  return readResult.kind === 'invalid' || readResult.kind === 'error'
    ? readResult.message
    : undefined;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function backoffMs(failureCount: number): number {
  const index = Math.min(Math.max(failureCount, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[index] * 60 * 1000;
}

export class ClaudeUsageCoordinator {
  private readonly cache: ClaudeUsageCache;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: ClaudeUsageCoordinatorOptions) {
    this.cache = new ClaudeUsageCache(options.cachePath);
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async refresh(): Promise<ClaudeUsageRefreshResult> {
    const readResult = await this.cache.read();
    const cached = readResult.kind === 'hit' ? readResult.snapshot : null;
    const warning = cacheWarning(readResult);
    const nowMs = this.now();

    if (cached?.backoffUntil && Date.parse(cached.backoffUntil) > nowMs) {
      return {
        kind: 'rateLimited',
        rows: cached.rows,
        fetchedAt: cached.rows.length > 0 ? cached.fetchedAt : null,
        backoffUntil: cached.backoffUntil,
        failureCount: cached.failureCount,
        cacheWarning: warning,
      };
    }
    if (cached && nowMs - Date.parse(cached.fetchedAt) < this.ttlMs) {
      return {
        kind: 'fresh',
        rows: cached.rows,
        fetchedAt: cached.fetchedAt,
        backoffUntil: null,
        failureCount: 0,
        unknownKinds: [],
        cacheWarning: warning,
      };
    }

    // SHORTCUT: 複数ウィンドウが同時に TTL 切れを踏むと最大でウィンドウ数ぶんの余分な fetch が走り得る. ceiling: VS Code ウィンドウ数ぶん. upgrade: 429 が残る実機ログが出たらファイルロックを追加する.
    const result = await this.options.client.fetchUsage();
    return this.applyFetchResult(result, cached, warning, nowMs);
  }

  private async applyFetchResult(
    result: ClaudeUsageResult,
    cached: ClaudeUsageSnapshot | null,
    warning: string | undefined,
    nowMs: number,
  ): Promise<ClaudeUsageRefreshResult> {
    if (result.kind === 'ok') {
      const snapshot: ClaudeUsageSnapshot = {
        version: 1,
        rows: result.rows,
        fetchedAt: toIso(nowMs),
        backoffUntil: null,
        failureCount: 0,
      };
      await this.cache.write(snapshot);
      return {
        kind: 'fresh',
        rows: snapshot.rows,
        fetchedAt: snapshot.fetchedAt,
        backoffUntil: null,
        failureCount: 0,
        unknownKinds: result.unknownKinds,
        cacheWarning: warning,
      };
    }
    if (result.kind === 'unauthenticated') {
      await this.cache.remove();
      return { kind: 'hidden', cacheWarning: warning };
    }
    if (result.kind === 'expired') {
      return { kind: 'expired', rows: cached?.rows ?? [], cacheWarning: warning };
    }
    if (result.kind === 'rateLimited') {
      const failureCount = (cached?.failureCount ?? 0) + 1;
      const backoffUntil = toIso(nowMs + backoffMs(failureCount));
      const snapshot: ClaudeUsageSnapshot = {
        version: 1,
        rows: cached?.rows ?? [],
        fetchedAt: cached?.fetchedAt ?? toIso(nowMs),
        backoffUntil,
        failureCount,
      };
      await this.cache.write(snapshot);
      return {
        kind: 'rateLimited',
        rows: snapshot.rows,
        fetchedAt: snapshot.rows.length > 0 ? snapshot.fetchedAt : null,
        backoffUntil,
        failureCount,
        cacheWarning: warning,
      };
    }

    if (cached && cached.rows.length > 0) {
      return {
        kind: 'stale',
        rows: cached.rows,
        fetchedAt: cached.fetchedAt,
        backoffUntil: cached.backoffUntil,
        failureCount: cached.failureCount,
        message: result.message,
        cacheWarning: warning,
      };
    }
    return {
      kind: 'error',
      rows: [],
      fetchedAt: null,
      message: result.message,
      cacheWarning: warning,
    };
  }
}
