import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Flusher } from '../flusher';
import { Recorder } from '../recorder';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-flusher-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Flusher', () => {
    it('writes a valid TraceFile JSON to disk', () => {
        const rec = new Recorder({ depthLimit: 8 });
        rec.enter('L0', null, 'foo', [1], 0);
        rec.exit(1, 42);

        const flusher = new Flusher({
            outputDir: tmpDir,
            runName: 'test-run',
            recorder: rec,
            lifelineMap: new Map([['src/foo.ts', 'L0']]),
            startedAt: '2026-05-02T09:00:00.000Z',
        });

        flusher.flush();

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
        expect(files).toHaveLength(1);

        const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'));
        expect(content.version).toBe(1);
        expect(content.events.length).toBe(2);
    });

    it('writes throw events in the trace file (lines 53-60)', () => {
        const rec = new Recorder({ depthLimit: 8 });
        const id = rec.enter('L0', 'L1', 'bar', ['arg'], 0);
        rec.throw(id, new Error('test error'));

        const flusher = new Flusher({
            outputDir: tmpDir,
            runName: 'throw-test',
            recorder: rec,
            lifelineMap: new Map([['src/bar.ts', 'L0']]),
            startedAt: '2026-05-02T09:00:00.000Z',
        });
        flusher.flush();

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
        const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'));
        const throwEvent = content.events.find((e: { type: string }) => e.type === 'throw');
        expect(throwEvent).toBeDefined();
        expect(throwEvent.ok).toBe(false);
        expect(throwEvent.error.message).toBe('test error');
    });

    it('writes io events and adds synthetic lifelines (lines 75-80)', () => {
        const rec = new Recorder({ depthLimit: 8 });
        // Directly push an io entry via the io() method
        rec.io('__process__', 'L_http', 'http.request', { url: 'http://example.com' });

        const flusher = new Flusher({
            outputDir: tmpDir,
            runName: 'io-test',
            recorder: rec,
            lifelineMap: new Map(), // empty — io lifelines are synthetic
            startedAt: '2026-05-02T09:00:00.000Z',
        });
        flusher.flush();

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
        const content = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'));
        // Should have created synthetic lifelines for '__process__' and 'L_http'
        const ids = content.lifelines.map((l: { id: string }) => l.id);
        expect(ids).toContain('__process__');
        expect(ids).toContain('L_http');
        // Label for '__process__' is 'process'; for 'L_http' it is 'http'
        const processLifeline = content.lifelines.find((l: { id: string }) => l.id === '__process__');
        expect(processLifeline.label).toBe('process');
        const httpLifeline = content.lifelines.find((l: { id: string }) => l.id === 'L_http');
        expect(httpLifeline.label).toBe('http');
    });

    it('sanitizes run name with special characters', () => {
        const rec = new Recorder({ depthLimit: 8 });
        const flusher = new Flusher({
            outputDir: tmpDir,
            runName: 'my run: test!',
            recorder: rec,
            lifelineMap: new Map(),
            startedAt: '2026-05-02T09:00:00.000Z',
        });
        flusher.flush();
        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
        expect(files).toHaveLength(1);
        // File name should not contain ':'
        expect(files[0]).not.toContain(':');
        expect(files[0]).not.toContain('!');
    });
});
