import { CURRENT_TRACE_VERSION, type TraceFile, type TraceFileV1 } from '../types';

const REQUIRED_METADATA_FIELDS = ['startedAt', 'endedAt', 'command', 'cwd', 'nodeVersion', 'depthLimit'] as const;

/**
 * 読み込んだ生の JSON を現行スキーマ（`CURRENT_TRACE_VERSION`）の `TraceFile` へ移送する。
 *
 * 環境非依存の純粋関数として実装し、Node 側の `loadTraceFile` と webview 側の `useTraceFile`
 * が同じ移送規則を共有する（`node:fs` に触れないため webview バンドルへ入れて安全）。
 *
 * 未知バージョンは fail-closed で throw する。ここは補助機構ではなくデータの解釈境界であり、
 * fail-open で読み進めると存在しないフィールドを既定値として黙って捏造することになる。
 */
export function migrateTraceFile(raw: unknown): TraceFile {
    // バージョン判定を形状検査より先に行う。未知バージョンのファイルに対して
    // 「metadata が足りない」と報告すると、原因（世代違い）が読み手に伝わらない。
    const version = readVersion(raw);
    const data = assertShape(raw);

    if (version === 1) {
        return migrateV1ToV2(data as unknown as TraceFileV1);
    }
    return data as unknown as TraceFile;
}

function readVersion(raw: unknown): 1 | typeof CURRENT_TRACE_VERSION {
    const version = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).version : undefined;
    if (version === 1 || version === CURRENT_TRACE_VERSION) {
        return version as 1 | typeof CURRENT_TRACE_VERSION;
    }
    throw new Error(
        `Unsupported trace version: ${String(version)} (supported: 1..${CURRENT_TRACE_VERSION})`,
    );
}

/** v1 → v2: `loc` は記録されていないため付与しない（欠落を既定値で埋めない）。 */
function migrateV1ToV2(file: TraceFileV1): TraceFile {
    return {
        version: CURRENT_TRACE_VERSION,
        metadata: file.metadata,
        lifelines: file.lifelines,
        events: file.events,
    };
}

interface RawTraceFile {
    metadata: Record<string, unknown>;
    lifelines: unknown[];
    events: unknown[];
}

function assertShape(raw: unknown): RawTraceFile {
    if (typeof raw !== 'object' || raw === null) {
        throw new TypeError('Trace file must be an object');
    }
    const data = raw as Record<string, unknown>;
    if (typeof data.metadata !== 'object' || data.metadata === null) {
        throw new Error('Missing metadata');
    }
    const metadata = data.metadata as Record<string, unknown>;
    for (const k of REQUIRED_METADATA_FIELDS) {
        if (!(k in metadata)) {
            throw new Error(`Missing metadata.${k}`);
        }
    }
    if (!Array.isArray(data.lifelines)) {
        throw new TypeError('lifelines must be array');
    }
    if (!Array.isArray(data.events)) {
        throw new TypeError('events must be array');
    }
    return { metadata, lifelines: data.lifelines, events: data.events };
}
