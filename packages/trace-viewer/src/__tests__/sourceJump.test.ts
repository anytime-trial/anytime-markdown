import { buildSequenceLayout } from '../engine/layout';
import { resolveSourceLocation } from '../engine/sourceJump';
import { buildCallTree } from '@anytime-markdown/trace-core/parse';
import { CURRENT_TRACE_VERSION } from '@anytime-markdown/trace-core/types';
import type { TraceFile } from '@anytime-markdown/trace-core/types';
import type { GraphNode } from '@anytime-markdown/graph-core';

function traceWithLoc(): TraceFile {
    return {
        version: CURRENT_TRACE_VERSION,
        metadata: {
            startedAt: '2026-08-02T00:00:00.000Z',
            endedAt: '2026-08-02T00:00:01.000Z',
            command: 'node foo.js',
            cwd: '/repo',
            nodeVersion: 'v22.0.0',
            depthLimit: 8,
        },
        lifelines: [
            { id: 'L0', kind: 'file', path: '/repo/src/foo.ts' },
            { id: 'L1', kind: 'file', path: '/repo/src/bar.ts' },
        ],
        events: [
            {
                id: 1, type: 'call', ts: 0, from: null, to: 'L0', fn: 'foo', args: [], depth: 0,
                loc: { file: '/repo/src/foo.ts', line: 10 },
            },
            {
                id: 2, type: 'call', ts: 1, from: 'L0', to: 'L1', fn: 'bar', args: [], depth: 1,
                loc: { file: '/repo/src/bar.ts', line: 25 },
            },
            { id: 3, type: 'return', ts: 2, of: 2, ok: true, result: null },
            { id: 4, type: 'return', ts: 3, of: 1, ok: true, result: null },
        ],
    };
}

describe('レイアウトのソース位置メタデータ', () => {
    it('活性化バーに呼び出し元のファイルと行を持たせる', () => {
        const file = traceWithLoc();
        const layout = buildSequenceLayout(file, buildCallTree(file));

        const activations = layout.nodes.filter(n => n.metadata?.['role'] === 'activation');
        expect(activations.length).toBeGreaterThanOrEqual(2);
        const locs = activations.map(n => [n.metadata?.['sourceFile'], n.metadata?.['sourceLine']]);
        expect(locs).toContainEqual(['/repo/src/foo.ts', 10]);
        expect(locs).toContainEqual(['/repo/src/bar.ts', 25]);
    });

    it('ライフラインヘッダはファイル先頭へのジャンプ先を持つ', () => {
        const file = traceWithLoc();
        const layout = buildSequenceLayout(file, buildCallTree(file));

        const header = layout.nodes.find(n => n.metadata?.['role'] === 'header');
        expect(header?.metadata?.['sourceFile']).toBe('/repo/src/foo.ts');
        expect(header?.metadata?.['sourceLine']).toBe(1);
    });

    it('loc を持たない v1 由来の trace ではジャンプ先を捏造しない', () => {
        const file = traceWithLoc();
        for (const ev of file.events) {
            if (ev.type === 'call') delete ev.loc;
        }
        const layout = buildSequenceLayout(file, buildCallTree(file));

        const activations = layout.nodes.filter(n => n.metadata?.['role'] === 'activation');
        expect(activations.every(n => n.metadata?.['sourceFile'] === undefined)).toBe(true);
    });
});

describe('resolveSourceLocation', () => {
    function node(metadata?: Record<string, string | number>): GraphNode {
        return { id: 'n1', type: 'rect', x: 0, y: 0, width: 10, height: 10, text: '', metadata } as GraphNode;
    }

    it('sourceFile / sourceLine を SourceLocation に変換する', () => {
        expect(resolveSourceLocation(node({ sourceFile: '/repo/src/foo.ts', sourceLine: 10 })))
            .toEqual({ file: '/repo/src/foo.ts', line: 10 });
    });

    it('ジャンプ先を持たないノード・null では null を返す', () => {
        expect(resolveSourceLocation(node({ role: 'io' }))).toBeNull();
        expect(resolveSourceLocation(node())).toBeNull();
        expect(resolveSourceLocation(null)).toBeNull();
    });

    it('行が数値でない場合は 1 行目へ倒す（ファイルは開ける）', () => {
        expect(resolveSourceLocation(node({ sourceFile: '/repo/src/foo.ts' })))
            .toEqual({ file: '/repo/src/foo.ts', line: 1 });
    });
});
