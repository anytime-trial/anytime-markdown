import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { loadTraceFile } from '../parse/loader';
import { CURRENT_TRACE_VERSION } from '../types';

const FIXTURES = path.join(__dirname, 'fixtures');

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-core-test-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadTraceFile', () => {
    it('loads a valid trace file from disk (v1 fixture は現行バージョンへ移送される)', async () => {
        const file = await loadTraceFile(path.join(FIXTURES, 'simple.json'));
        expect(file.version).toBe(CURRENT_TRACE_VERSION);
        expect(file.lifelines).toHaveLength(2);
        expect(file.events).toHaveLength(4);
    });

    it('rejects unsupported version', async () => {
        const tmp = path.join(tmpDir, 'future.json');
        fs.writeFileSync(
            tmp,
            JSON.stringify({ version: CURRENT_TRACE_VERSION + 1, metadata: {}, lifelines: [], events: [] }),
        );
        await expect(loadTraceFile(tmp)).rejects.toThrow(/version/i);
    });

    it('rejects malformed JSON', async () => {
        const tmp = path.join(tmpDir, 'bad.json');
        fs.writeFileSync(tmp, '{not json');
        await expect(loadTraceFile(tmp)).rejects.toThrow();
    });

    it('rejects when required metadata fields missing', async () => {
        const tmp = path.join(tmpDir, 'meta.json');
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, metadata: {}, lifelines: [], events: [] }));
        await expect(loadTraceFile(tmp)).rejects.toThrow(/metadata/i);
    });

    it('rejects when metadata is missing entirely', async () => {
        const tmp = path.join(tmpDir, 'nometa.json');
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, lifelines: [], events: [] }));
        await expect(loadTraceFile(tmp)).rejects.toThrow('Missing metadata');
    });

    it('rejects when metadata is not an object', async () => {
        const tmp = path.join(tmpDir, 'badmeta.json');
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, metadata: 42, lifelines: [], events: [] }));
        await expect(loadTraceFile(tmp)).rejects.toThrow('Missing metadata');
    });

    it('rejects when lifelines is not an array', async () => {
        const tmp = path.join(tmpDir, 'lifelines.json');
        const validMeta = { startedAt: '', endedAt: '', command: '', cwd: '', nodeVersion: '', depthLimit: 0 };
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, metadata: validMeta, lifelines: null, events: [] }));
        await expect(loadTraceFile(tmp)).rejects.toThrow('lifelines must be array');
    });

    it('rejects when events is not an array', async () => {
        const tmp = path.join(tmpDir, 'events.json');
        const validMeta = { startedAt: '', endedAt: '', command: '', cwd: '', nodeVersion: '', depthLimit: 0 };
        fs.writeFileSync(tmp, JSON.stringify({ version: 1, metadata: validMeta, lifelines: [], events: null }));
        await expect(loadTraceFile(tmp)).rejects.toThrow('events must be array');
    });
});
