import type { TraceFile, JsonValue, SourceLocation } from '../types';

type CallEvent   = Extract<TraceFile['events'][number], { type: 'call' }>;
type ReturnEvent = Extract<TraceFile['events'][number], { type: 'return' }>;
type ThrowEvent  = Extract<TraceFile['events'][number], { type: 'throw' }>;

export interface CallNode {
    eventId: number;
    fn: string;
    lifelineId: string;
    fromLifelineId: string | null;
    args: JsonValue[];
    depth: number;
    startTs: number;
    endTs: number | null;
    durationMs: number | null;
    ok: boolean;
    result?: JsonValue;
    error?: { name: string; message: string; stack?: string };
    children: CallNode[];
    loc?: SourceLocation;
}

function handleCallEvent(ev: CallEvent, stack: CallNode[], byEventId: Map<number, CallNode>): void {
    const node: CallNode = {
        eventId: ev.id, fn: ev.fn, lifelineId: ev.to, fromLifelineId: ev.from,
        args: ev.args, depth: ev.depth, startTs: ev.ts, endTs: null, durationMs: null,
        ok: true, children: [], loc: ev.loc,
    };
    stack.at(-1)!.children.push(node);
    stack.push(node);
    byEventId.set(ev.id, node);
}

function handleReturnOrThrow(ev: ReturnEvent | ThrowEvent, stack: CallNode[], byEventId: Map<number, CallNode>): void {
    const target = byEventId.get(ev.of);
    if (!target) return;
    target.endTs = ev.ts;
    target.durationMs = ev.ts - target.startTs;
    if (ev.type === 'return') {
        target.ok = true;
        target.result = ev.result;
    } else {
        target.ok = false;
        target.error = ev.error;
    }
    while (stack.length > 1 && stack.at(-1)!.eventId !== ev.of) stack.pop();
    if (stack.length > 1) stack.pop();
}

export function buildCallTree(file: TraceFile): CallNode {
    const root: CallNode = {
        eventId: -1, fn: '__root__', lifelineId: '', fromLifelineId: null,
        args: [], depth: -1, startTs: 0, endTs: null, durationMs: null,
        ok: true, children: [],
    };
    const stack: CallNode[] = [root];
    const byEventId = new Map<number, CallNode>();
    for (const ev of file.events) {
        if (ev.type === 'call') {
            handleCallEvent(ev, stack, byEventId);
        } else if (ev.type === 'return' || ev.type === 'throw') {
            handleReturnOrThrow(ev, stack, byEventId);
        }
    }
    return root;
}
