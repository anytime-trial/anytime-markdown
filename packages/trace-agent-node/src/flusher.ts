import * as fs from 'fs';
import * as path from 'path';
import type { Recorder } from './recorder';
import type { TraceFile } from '@anytime-markdown/trace-core';
import { safeSerialize } from './serializer';
import type { JsonValue } from '@anytime-markdown/trace-core';

interface FlusherOptions {
    outputDir: string;
    runName: string;
    recorder: Recorder;
    lifelineMap: Map<string, string>;
    startedAt: string;
}

/**
 * 出力するスキーマバージョン。trace-core の `CURRENT_TRACE_VERSION` を**値として** import しない
 * （trace-core は TS ソースを配る型専用パッケージで、実行時 require は
 * `node --require @anytime-markdown/trace-agent-node` を ERR_MODULE_NOT_FOUND で落とす）。
 * 型を `TraceFile['version']` に固定しているため、スキーマが上がればここが型エラーになる。
 */
const OUTPUT_TRACE_VERSION: TraceFile['version'] = 2;

export class Flusher {
    private readonly opts: FlusherOptions;

    constructor(opts: FlusherOptions) {
        this.opts = opts;
    }

    flush(): void {
        const { outputDir, runName, recorder, lifelineMap, startedAt } = this.opts;
        fs.mkdirSync(outputDir, { recursive: true });

        const endedAt = new Date().toISOString();
        const safeName = runName.replaceAll(/[^a-z0-9-_]/gi, '-');
        const timestamp = endedAt.replaceAll(/[:.]/g, '-');
        const filename = path.join(outputDir, `${timestamp}-${safeName}.json`);

        const lifelines: TraceFile['lifelines'] = Array.from(lifelineMap.entries()).map(([filePath, id]) => ({
            id, kind: 'file' as const, path: filePath,
        }));

        const events: TraceFile['events'] = recorder.entries().map(entry => {
            if (entry.type === 'call') {
                return {
                    id: entry.id, type: 'call', ts: entry.ts,
                    from: entry.fromLifelineId ?? null,
                    to: entry.lifelineId!,
                    fn: entry.fn!, args: (entry.args ?? []).map(a => safeSerialize(a)) as JsonValue[],
                    depth: entry.depth ?? 0,
                    // TRC-5: ソースジャンプ先。行番号が取れなかった呼び出しでは undefined のまま落とす。
                    ...(entry.loc ? { loc: entry.loc } : {}),
                };
            }
            if (entry.type === 'return') {
                return {
                    id: entry.id, type: 'return', ts: entry.ts,
                    of: entry.ofId!, ok: true as const,
                    result: safeSerialize(entry.result) as JsonValue,
                };
            }
            if (entry.type === 'throw') {
                return {
                    id: entry.id, type: 'throw', ts: entry.ts,
                    of: entry.ofId!, ok: false as const,
                    error: entry.error!,
                };
            }
            return {
                id: entry.id, type: 'io', ts: entry.ts,
                from: entry.fromLifelineId ?? '__process__',
                to: entry.lifelineId ?? 'L_io',
                method: entry.method ?? 'unknown',
                meta: safeSerialize(entry.meta) as JsonValue,
            };
        });

        // io イベントが参照する lifeline ID を lifelines 配列に補完する。
        // patchFs/Http/Sql は '__process__' / 'L_fs' 等の固定 ID を使うが
        // lifelineMap（関数呼び出し lifeline）には含まれないため別途追加が必要。
        const existingIds = new Set(lifelines.map(l => l.id));
        for (const ev of events) {
            if (ev.type !== 'io') continue;
            for (const raw of [ev.from, ev.to] as (string | null | undefined)[]) {
                const id = raw ?? '';
                if (!id || existingIds.has(id)) continue;
                existingIds.add(id);
                const label = id === '__process__' ? 'process' : id.replace(/^L_/, '');
                lifelines.push({ id, kind: 'io', label });
            }
        }

        const traceFile: TraceFile = {
            version: OUTPUT_TRACE_VERSION,
            metadata: {
                startedAt,
                endedAt,
                command: process.argv.join(' '),
                cwd: process.cwd(),
                nodeVersion: process.version,
                depthLimit: 8,
            },
            lifelines,
            events,
        };

        fs.writeFileSync(filename, JSON.stringify(traceFile, null, 2), 'utf-8');
    }
}
