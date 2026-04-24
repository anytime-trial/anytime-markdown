const STORAGE_KEY = "anytime-markdown:embedSeenStore:v1";
const MAX_ENTRIES = 500;

type SeenMap = Record<string, string>;

function hasLocalStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

let cache: SeenMap | null = null;

function loadCache(): SeenMap {
    if (cache) return cache;
    if (!hasLocalStorage()) {
        cache = {};
        return cache;
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            cache = {};
            return cache;
        }
        const parsed = JSON.parse(raw);
        cache = typeof parsed === "object" && parsed ? (parsed as SeenMap) : {};
    } catch (e) {
        console.warn(`embedSeenStore: failed to read storage - ${(e as Error).message}`);
        cache = {};
    }
    return cache;
}

function persist(map: SeenMap): void {
    if (!hasLocalStorage()) return;
    try {
        const keys = Object.keys(map);
        if (keys.length > MAX_ENTRIES) {
            for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete map[keys[i]];
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        console.warn(`embedSeenStore: failed to write storage - ${(e as Error).message}`);
    }
}

export function markEmbedSeen(url: string, fingerprint: string): void {
    const map = loadCache();
    if (map[url] === fingerprint) return;
    map[url] = fingerprint;
    persist(map);
}

export function isEmbedSeen(url: string, fingerprint: string): boolean {
    return loadCache()[url] === fingerprint;
}

export function __resetForTest(): void {
    cache = null;
    if (!hasLocalStorage()) return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn(`embedSeenStore: failed to reset storage - ${(e as Error).message}`);
    }
}
