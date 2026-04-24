import type { OembedData, OgpData } from "../types/embedProvider";

const KEY_PREFIX = "anytime-markdown:embed-cache:v1:";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ERROR_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 500;
const MAX_ENTRY_BYTES = 100 * 1024;

type CacheValue = OgpData | OembedData;

interface CachedEntry<T = CacheValue> {
    data: T;
    savedAt: number;
}

interface CachedError {
    error: string;
    savedAt: number;
}

export interface EmbedCacheOptions {
    ttlMs?: number;
    errorTtlMs?: number;
}

function djb2Hash(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = (h * 33) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
}

function hasLocalStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export class EmbedCache {
    private readonly ttlMs: number;
    private readonly errorTtlMs: number;

    constructor(options: EmbedCacheOptions = {}) {
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.errorTtlMs = options.errorTtlMs ?? DEFAULT_ERROR_TTL_MS;
    }

    private key(url: string): string {
        return `${KEY_PREFIX}${djb2Hash(url)}`;
    }

    private errorKey(url: string): string {
        return `${KEY_PREFIX}err:${djb2Hash(url)}`;
    }

    get(url: string): CacheValue | null {
        if (!hasLocalStorage()) return null;
        try {
            const raw = window.localStorage.getItem(this.key(url));
            if (!raw) return null;
            const entry = JSON.parse(raw) as CachedEntry;
            if (Date.now() - entry.savedAt > this.ttlMs) {
                window.localStorage.removeItem(this.key(url));
                return null;
            }
            return entry.data;
        } catch {
            return null;
        }
    }

    set(url: string, data: CacheValue): void {
        if (!hasLocalStorage()) return;
        try {
            // Strip rawHtml before persisting — it's transient for RSS discovery only.
            const stripped: CacheValue = "rawHtml" in data
                ? { ...(data as OgpData), rawHtml: null }
                : data;
            const payload = JSON.stringify({ data: stripped, savedAt: Date.now() } satisfies CachedEntry);
            if (payload.length > MAX_ENTRY_BYTES) return;
            this.evictIfNeeded();
            window.localStorage.setItem(this.key(url), payload);
        } catch (err) {
            console.warn("[embedCache] set failed", err);
        }
    }

    getError(url: string): string | null {
        if (!hasLocalStorage()) return null;
        try {
            const raw = window.localStorage.getItem(this.errorKey(url));
            if (!raw) return null;
            const entry = JSON.parse(raw) as CachedError;
            if (Date.now() - entry.savedAt > this.errorTtlMs) {
                window.localStorage.removeItem(this.errorKey(url));
                return null;
            }
            return entry.error;
        } catch {
            return null;
        }
    }

    setError(url: string, error: string): void {
        if (!hasLocalStorage()) return;
        try {
            const payload = JSON.stringify({ error, savedAt: Date.now() } satisfies CachedError);
            this.evictIfNeeded();
            window.localStorage.setItem(this.errorKey(url), payload);
        } catch (err) {
            console.warn("[embedCache] setError failed", err);
        }
    }

    private evictIfNeeded(): void {
        if (!hasLocalStorage()) return;
        const keys: { key: string; savedAt: number }[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith(KEY_PREFIX)) continue;
            try {
                const raw = window.localStorage.getItem(key);
                if (!raw) continue;
                const entry = JSON.parse(raw) as { savedAt?: number };
                keys.push({ key, savedAt: entry.savedAt ?? 0 });
            } catch {
                window.localStorage.removeItem(key);
            }
        }
        if (keys.length < MAX_ENTRIES) return;
        keys.sort((a, b) => a.savedAt - b.savedAt);
        const removeCount = keys.length - MAX_ENTRIES + 1;
        for (let i = 0; i < removeCount; i++) {
            window.localStorage.removeItem(keys[i].key);
        }
    }
}
