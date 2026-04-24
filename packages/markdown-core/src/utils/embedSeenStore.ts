const STORAGE_KEY = "anytime-markdown:embedSeenStore:v1";
const MAX_ENTRIES = 500;

type SeenMap = Record<string, string>;

function readStorage(): SeenMap {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed ? (parsed as SeenMap) : {};
    } catch {
        return {};
    }
}

function writeStorage(map: SeenMap): void {
    try {
        const keys = Object.keys(map);
        if (keys.length > MAX_ENTRIES) {
            for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete map[keys[i]];
        }
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        globalThis.console?.warn?.(`embedSeenStore: failed to write storage - ${(e as Error).message}`);
    }
}

export function markEmbedSeen(url: string, fingerprint: string): void {
    const map = readStorage();
    map[url] = fingerprint;
    writeStorage(map);
}

export function isEmbedSeen(url: string, fingerprint: string): boolean {
    const map = readStorage();
    return map[url] === fingerprint;
}

export function __resetForTest(): void {
    try {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
        // noop — test-only reset
    }
}
