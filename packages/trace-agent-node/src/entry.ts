import * as path from 'path';
import { installRequireHook } from './requireHook';
import { installEsmHook } from './esmHook';
import { patchHttp } from './monkeyPatch/http';
import { patchSql } from './monkeyPatch/sql';
import { patchFs } from './monkeyPatch/fs';
import { globalRecorder } from './globalRecorder';
import { getLifelineMap } from './runtime';
import { Flusher } from './flusher';

const startedAt = new Date().toISOString();
const cwd = process.cwd();
const outputDir = process.env['TRACE_OUTPUT_DIR'] ?? path.join(cwd, '.anytime', 'trace');
const runName = process.env['TRACE_RUN_NAME'] ?? path.basename(process.argv[1] ?? 'run');

installRequireHook({ include: [cwd], exclude: [] });
installEsmHook({ include: [cwd], exclude: [] });
patchHttp();
patchSql();
patchFs();

process.on('beforeExit', () => {
    const flusher = new Flusher({
        outputDir,
        runName,
        recorder: globalRecorder,
        lifelineMap: getLifelineMap(),
        startedAt,
    });
    flusher.flush();
});

if (process.env['WORKER_THREADS_WARN'] !== '0') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('worker_threads') as typeof import('worker_threads');
    const OrigWorker = Worker;
    // worker_threads は --require を継承しないため、サブワーカー内の呼び出しは記録されない
    (require('worker_threads') as { Worker: typeof Worker }).Worker = class TracedWorker extends OrigWorker {
        constructor(filename: string | URL, options?: ConstructorParameters<typeof OrigWorker>[1]) {
            console.warn('[trace-agent-node] worker_threads Worker は計装されません。メインスレッドのみ記録します。');
            super(filename, options);
        }
    };
}
