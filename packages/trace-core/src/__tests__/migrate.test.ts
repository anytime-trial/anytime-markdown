import { migrateTraceFile } from '../parse/migrate';
import { CURRENT_TRACE_VERSION } from '../types';

function v1File(overrides: Record<string, unknown> = {}) {
    return {
        version: 1,
        metadata: {
            startedAt: '2026-08-02T00:00:00.000Z',
            endedAt: '2026-08-02T00:00:01.000Z',
            command: 'node foo.js',
            cwd: '/repo',
            nodeVersion: 'v22.0.0',
            depthLimit: 20,
        },
        lifelines: [{ id: 'L0', kind: 'file', path: '/repo/src/foo.ts' }],
        events: [
            { id: 1, type: 'call', ts: 0, from: null, to: 'L0', fn: 'foo', args: [], depth: 0 },
            { id: 2, type: 'return', ts: 1, of: 1, ok: true, result: null },
        ],
        ...overrides,
    };
}

describe('migrateTraceFile', () => {
    it('v1 を現行バージョンへ移送し、loc を持たない call イベントをそのまま残す', () => {
        const migrated = migrateTraceFile(v1File());

        expect(migrated.version).toBe(CURRENT_TRACE_VERSION);
        expect(migrated.events).toHaveLength(2);
        const call = migrated.events[0];
        expect(call.type).toBe('call');
        expect(call.type === 'call' ? call.loc : 'not-a-call').toBeUndefined();
        expect(migrated.lifelines[0]?.path).toBe('/repo/src/foo.ts');
    });

    it('現行バージョンは loc を保持したまま素通しする', () => {
        const raw = {
            ...v1File(),
            version: CURRENT_TRACE_VERSION,
            events: [
                {
                    id: 1, type: 'call', ts: 0, from: null, to: 'L0', fn: 'foo', args: [], depth: 0,
                    loc: { file: '/repo/src/foo.ts', line: 42 },
                },
            ],
        };

        const migrated = migrateTraceFile(raw);

        const call = migrated.events[0];
        expect(call.type === 'call' ? call.loc : undefined).toEqual({ file: '/repo/src/foo.ts', line: 42 });
    });

    it('未知の新しいバージョンは fail-closed で明示エラーにする（誤解釈させない）', () => {
        expect(() => migrateTraceFile(v1File({ version: CURRENT_TRACE_VERSION + 1 })))
            .toThrow(/Unsupported trace version/);
    });

    it('version が数値でない場合もエラーにする', () => {
        expect(() => migrateTraceFile(v1File({ version: 'one' }))).toThrow(/Unsupported trace version/);
    });

    it('metadata 必須フィールドの欠損を検出する', () => {
        const broken = v1File();
        delete (broken.metadata as Record<string, unknown>).cwd;
        expect(() => migrateTraceFile(broken)).toThrow(/metadata\.cwd/);
    });

    it('lifelines / events が配列でない場合はエラーにする', () => {
        expect(() => migrateTraceFile(v1File({ lifelines: {} }))).toThrow(/lifelines/);
        expect(() => migrateTraceFile(v1File({ events: null }))).toThrow(/events/);
    });
});
