import { render, screen, waitFor } from '@testing-library/react';
import { CURRENT_TRACE_VERSION } from '@anytime-markdown/trace-core/types';
import { useTraceFile, type TraceFileSource } from '../hooks/useTraceFile';

function v1Json(): string {
    return JSON.stringify({
        version: 1,
        metadata: {
            startedAt: '2026-08-02T00:00:00.000Z',
            endedAt: '2026-08-02T00:00:01.000Z',
            command: 'node foo.js',
            cwd: '/repo',
            nodeVersion: 'v22.0.0',
            depthLimit: 8,
        },
        lifelines: [{ id: 'L0', kind: 'file', path: '/repo/src/foo.ts' }],
        events: [{ id: 1, type: 'call', ts: 0, from: null, to: 'L0', fn: 'foo', args: [], depth: 0 }],
    });
}

function Probe({ source }: Readonly<{ source: TraceFileSource }>) {
    const state = useTraceFile(source);
    if (state.status === 'loaded') return <div data-testid="result">version:{state.file.version}</div>;
    if (state.status === 'error') return <div data-testid="result">error:{state.message}</div>;
    return <div data-testid="result">{state.status}</div>;
}

describe('useTraceFile', () => {
    it('v1 の trace ファイルをマイグレータ経由で読み込む（旧ファイルを弾かない）', async () => {
        render(<Probe source={{ name: 'old.json', load: () => Promise.resolve(v1Json()) }} />);

        await waitFor(() => {
            expect(screen.getByTestId('result').textContent).toBe(`version:${CURRENT_TRACE_VERSION}`);
        });
    });

    it('未知バージョンはエラー状態として提示する', async () => {
        const future = JSON.stringify({ ...JSON.parse(v1Json()), version: CURRENT_TRACE_VERSION + 1 });
        render(<Probe source={{ name: 'future.json', load: () => Promise.resolve(future) }} />);

        await waitFor(() => {
            expect(screen.getByTestId('result').textContent).toMatch(/error:Unsupported trace version/);
        });
    });
});
