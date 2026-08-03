import type { RecorderEntry } from './types';

export class Recorder {
    private _entries: RecorderEntry[] = [];
    private _counter = 0;
    private readonly _depthLimit: number;

    constructor(opts: { depthLimit: number }) {
        this._depthLimit = opts.depthLimit;
    }

    enter(
        lifelineId: string,
        fromLifelineId: string | null,
        fn: string,
        args: unknown[],
        depth: number,
        loc?: { file: string; line: number },
    ): number {
        if (depth > this._depthLimit) return -1;
        const id = ++this._counter;
        this._entries.push({
            id, type: 'call', ts: performance.now(),
            lifelineId, fromLifelineId, fn, args, depth,
            ...(loc ? { loc } : {}),
        });
        return id;
    }

    exit(ofId: number, result: unknown): void {
        if (ofId === -1) return;
        this._entries.push({
            id: ++this._counter, type: 'return', ts: performance.now(),
            lifelineId: null, fromLifelineId: null, ofId, result,
        });
    }

    throw(ofId: number, err: unknown): void {
        if (ofId === -1) return;
        const e = err instanceof Error ? err : new Error(String(err));
        this._entries.push({
            id: ++this._counter, type: 'throw', ts: performance.now(),
            lifelineId: null, fromLifelineId: null, ofId,
            error: { name: e.name, message: e.message, stack: e.stack },
        });
    }

    io(fromId: string, toId: string, method: string, meta: unknown): void {
        this._entries.push({
            id: ++this._counter, type: 'io', ts: performance.now(),
            lifelineId: toId, fromLifelineId: fromId, method, meta,
        });
    }

    entries(): ReadonlyArray<RecorderEntry> {
        return this._entries;
    }

    reset(): void {
        this._entries = [];
        this._counter = 0;
    }
}
