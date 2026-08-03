import { useState, useEffect } from 'react';
import type { TraceFile } from '@anytime-markdown/trace-core/types';
import { migrateTraceFile } from '@anytime-markdown/trace-core/parse';

export interface TraceFileSource {
    name: string;
    /** Load the raw JSON text of the trace file */
    load(): Promise<string>;
}

export type TraceFileState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; file: TraceFile }
    | { status: 'error'; message: string };

export function useTraceFile(source: TraceFileSource | null): TraceFileState {
    const [state, setState] = useState<TraceFileState>({ status: 'idle' });

    useEffect(() => {
        if (!source) {
            setState({ status: 'idle' });
            return;
        }
        let cancelled = false;
        setState({ status: 'loading' });
        source.load().then((text) => {
            if (cancelled) return;
            try {
                // TRC-6: 旧バージョンの trace ファイルはマイグレータで現行スキーマへ移送する。
                // 未知バージョンは migrateTraceFile が throw し、下の catch がエラー表示へ倒す。
                const file = migrateTraceFile(JSON.parse(text));
                setState({ status: 'loaded', file });
            } catch (err) {
                setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
            }
        }).catch((err: unknown) => {
            if (cancelled) return;
            setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        });
        return () => { cancelled = true; };
    }, [source]);

    return state;
}
