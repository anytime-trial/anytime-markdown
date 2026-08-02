export interface TraceAgentConfig {
    depthLimit: number;
    outputDir: string;
    runName: string;
    include: string[];
    exclude: string[];
}

export interface RecorderEntry {
    id: number;
    type: 'call' | 'return' | 'throw' | 'io';
    ts: number;
    lifelineId: string | null;
    fromLifelineId: string | null;
    fn?: string;
    args?: unknown[];
    depth?: number;
    ofId?: number;
    result?: unknown;
    error?: { name: string; message: string; stack?: string };
    method?: string;
    meta?: unknown;
    /** call エントリのソース位置（TRC-5 ソースジャンプ先）。行番号が取れない場合は未設定。 */
    loc?: { file: string; line: number };
}

export interface LifelineEntry {
    id: string;
    kind: 'file' | 'io';
    path?: string;
    label?: string;
}
