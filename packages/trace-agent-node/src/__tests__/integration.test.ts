import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vm from 'vm';
import { instrumentCode } from '../astTransform';
import { globalRecorder } from '../globalRecorder';
import { __traceEnter, __traceExit, __traceThrow, getLifelineMap, resetLifelineMap } from '../runtime';
import { Flusher } from '../flusher';
import { CURRENT_TRACE_VERSION } from '@anytime-markdown/trace-core/types';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-int-'));
    globalRecorder.reset();
    resetLifelineMap();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('integration', () => {
    it('instruments JS, records calls, and writes a valid TraceFile JSON', () => {
        const src = `function greet(name) { return 'Hello, ' + name; }\nmodule.exports = greet;\n`;
        const filename = path.join(tmpDir, 'greet.js');

        const instrumented = instrumentCode(src, filename);

        // Strip the require('@anytime-markdown/trace-agent-node/runtime') preamble — inject directly
        const withoutPreamble = instrumented.replace(
            /const\s*\{[^}]+\}\s*=\s*require\(['"]\S+\/runtime['"]\);\n/,
            ''
        );

        const moduleObj = { exports: {} as Record<string, unknown> };
        vm.runInNewContext(withoutPreamble, {
            __traceEnter,
            __traceExit,
            __traceThrow,
            module: moduleObj,
            exports: moduleObj.exports,
            require,
            __filename: filename,
            __dirname: tmpDir,
        });

        const greet = moduleObj.exports as unknown as (name: string) => string;
        greet('World');

        expect(globalRecorder.entries().length).toBeGreaterThan(0);
        const callEntry = globalRecorder.entries().find(e => e.type === 'call');
        expect(callEntry).toBeDefined();
        expect(callEntry?.fn).toBe('greet');
        // TRC-5: AST が拾った定義行が loc として残る（1 行目の function greet）
        expect(callEntry?.loc).toEqual({ file: filename, line: 1 });

        const traceOut = path.join(tmpDir, 'out');
        new Flusher({
            outputDir: traceOut,
            runName: 'integration-test',
            recorder: globalRecorder,
            lifelineMap: getLifelineMap(),
            startedAt: new Date().toISOString(),
        }).flush();

        const files = fs.readdirSync(traceOut).filter(f => f.endsWith('.json'));
        expect(files.length).toBeGreaterThan(0);

        const content = JSON.parse(fs.readFileSync(path.join(traceOut, files[0]), 'utf-8'));
        expect(content.version).toBe(CURRENT_TRACE_VERSION);
        expect(content.events.find((e: { type: string }) => e.type === 'call')).toBeDefined();
    });
});
