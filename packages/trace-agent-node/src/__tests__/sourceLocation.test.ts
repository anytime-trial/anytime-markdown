import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { CURRENT_TRACE_VERSION } from '@anytime-markdown/trace-core/types';
import { Flusher } from '../flusher';
import { Recorder } from '../recorder';
import { globalRecorder } from '../globalRecorder';
import { __traceEnter, resetLifelineMap } from '../runtime';

/**
 * TRC-5: ソースジャンプ先（loc）が記録側から trace ファイルまで通ることを固定する。
 * 以前は astTransform が渡した行番号を runtime が捨てており、trace JSON に
 * ジャンプ先が存在しなかった（viewer 側の配線だけでは復旧できない欠落）。
 */
describe('source location plumbing', () => {
    afterEach(() => {
        globalRecorder.reset();
        resetLifelineMap();
    });

    it('__traceEnter が受けたファイルと行を call エントリの loc に残す', () => {
        __traceEnter('/repo/src/foo.ts', 'foo', [], 0, 42);

        const entry = globalRecorder.entries().find(e => e.type === 'call');
        expect(entry?.loc).toEqual({ file: '/repo/src/foo.ts', line: 42 });
    });

    it('行番号が取れなかった場合（0）は loc を付けない', () => {
        __traceEnter('/repo/src/foo.ts', 'anonymous', [], 0, 0);

        const entry = globalRecorder.entries().find(e => e.type === 'call');
        expect(entry?.loc).toBeUndefined();
    });

    it('Flusher が call イベントへ loc を出力し、現行スキーマバージョンを書く', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-loc-'));
        try {
            const rec = new Recorder({ depthLimit: 8 });
            rec.enter('L0', null, 'foo', [], 0, { file: '/repo/src/foo.ts', line: 7 });

            new Flusher({
                outputDir: tmpDir,
                runName: 'loc-test',
                recorder: rec,
                lifelineMap: new Map([['/repo/src/foo.ts', 'L0']]),
                startedAt: '2026-08-02T09:00:00.000Z',
            }).flush();

            const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
            const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'));

            expect(content.version).toBe(CURRENT_TRACE_VERSION);
            const call = content.events.find((e: { type: string }) => e.type === 'call');
            expect(call.loc).toEqual({ file: '/repo/src/foo.ts', line: 7 });
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
