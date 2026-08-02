export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [k: string]: JsonValue };

export interface SourceLocation {
    file: string;
    line: number;
    column?: number;
}

export interface TraceMetadata {
    startedAt: string;
    endedAt: string;
    command: string;
    cwd: string;
    nodeVersion: string;
    depthLimit: number;
}

export interface Lifeline {
    id: string;
    kind: 'file' | 'io';
    path?: string;
    label?: string;
}

export type TraceEvent =
    | { id: number; type: 'call'; ts: number; from: string | null; to: string; fn: string; args: JsonValue[]; depth: number; loc?: SourceLocation }
    | { id: number; type: 'return'; ts: number; of: number; ok: true; result: JsonValue }
    | { id: number; type: 'throw'; ts: number; of: number; ok: false; error: { name: string; message: string; stack?: string } }
    | { id: number; type: 'io'; ts: number; from: string; to: string; method: string; meta: JsonValue };

/**
 * 現行の trace スキーマバージョン。
 *
 * v2 で `call` イベントの `loc`（ソースジャンプ先）を記録対象へ加えた。v1 の trace ファイルは
 * `parse/migrate.ts` の `migrateTraceFile` が現行版へ移送する（`loc` は欠落＝`undefined`）。
 */
export const CURRENT_TRACE_VERSION = 2;

export interface TraceFile {
    version: typeof CURRENT_TRACE_VERSION;
    metadata: TraceMetadata;
    lifelines: Lifeline[];
    events: TraceEvent[];
}

/**
 * version 1 の trace ファイル。`call` イベントに `loc` を持たない
 * （記録側が AST から得た行番号を捨てていたため、実データに現れることがなかった）。
 */
export interface TraceFileV1 {
    version: 1;
    metadata: TraceMetadata;
    lifelines: Lifeline[];
    events: TraceEvent[];
}
