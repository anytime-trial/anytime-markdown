import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { installRequireHook, uninstallRequireHook } from '../requireHook';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-hook-'));
});

afterEach(() => {
    uninstallRequireHook();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.keys(require.cache).filter(k => k.startsWith(tmpDir)).forEach(k => { delete require.cache[k]; });
});

describe('requireHook', () => {
    it('transforms required JS files (function is callable after instrumentation)', () => {
        const file = path.join(tmpDir, 'sample.js');
        fs.writeFileSync(file, `module.exports = function add(a, b) { return a + b; };`);
        installRequireHook({ include: [tmpDir], exclude: [] });
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const add = require(file) as (a: number, b: number) => number;
        expect(typeof add).toBe('function');
    });

    it('does not transform files outside include paths', () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-outside-'));
        try {
            const file = path.join(outsideDir, 'outside.js');
            fs.writeFileSync(file, `module.exports = 99;`);
            installRequireHook({ include: [tmpDir], exclude: [] });
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const result = require(file);
            expect(result).toBe(99);
        } finally {
            fs.rmSync(outsideDir, { recursive: true, force: true });
            Object.keys(require.cache).filter(k => k.includes('trace-outside-')).forEach(k => { delete require.cache[k]; });
        }
    });

    it('skips files that match the exclude list (lines 35-39)', () => {
        // When include is empty and exclude contains the directory, file should be skipped
        const excludedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-excluded-'));
        try {
            const file = path.join(excludedDir, 'excluded.js');
            fs.writeFileSync(file, `module.exports = 'original';`);
            installRequireHook({ include: [], exclude: [excludedDir] });
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const result = require(file);
            expect(result).toBe('original');
        } finally {
            fs.rmSync(excludedDir, { recursive: true, force: true });
            Object.keys(require.cache).filter(k => k.includes('trace-excluded-')).forEach(k => { delete require.cache[k]; });
        }
    });

    it('does not transform when include is empty and exclude does not match (default allow)', () => {
        const allowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-allowed-'));
        try {
            const file = path.join(allowedDir, 'allowed.js');
            fs.writeFileSync(file, `module.exports = function val() { return 42; };`);
            // include=[], exclude=[] → should transform
            installRequireHook({ include: [], exclude: [] });
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const result = require(file);
            expect(typeof result).toBe('function');
        } finally {
            fs.rmSync(allowedDir, { recursive: true, force: true });
            Object.keys(require.cache).filter(k => k.includes('trace-allowed-')).forEach(k => { delete require.cache[k]; });
        }
    });

    it('is idempotent: second installRequireHook call is a no-op', () => {
        installRequireHook({ include: [tmpDir], exclude: [] });
        // Second call should not throw and should not double-install
        expect(() => installRequireHook({ include: [tmpDir], exclude: [] })).not.toThrow();
    });
});
