import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runC4SourceAnalyze } from '../runC4SourceAnalyze';
import type { C4SourceAnalyzeResult } from '../analyzeChildProtocol';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  send(msg: unknown) {
    this.sent.push(msg);
  }
  kill() {}
}

function writeResult(result: C4SourceAnalyzeResult): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4sa-'));
  const p = path.join(dir, 'result.json');
  fs.writeFileSync(p, JSON.stringify(result));
  return p;
}

describe('runC4SourceAnalyze', () => {
  it('c4SourceAnalyze メッセージを送り、result を受けて返す', async () => {
    const child = new FakeChild();
    const promise = runC4SourceAnalyze(
      '/fake/analyze-child.js',
      { kind: 'exports', files: [{ filePath: 'a.ts', content: 'export const x=1;' }], componentId: 'c' },
      { fork: () => child as never },
    );
    child.emit('message', { type: 'result', resultPath: writeResult({ kind: 'exports', symbols: [{ name: 'x' }] }) });
    child.emit('exit', 0, null);
    const result = await promise;
    expect(result.kind).toBe('exports');
    if (result.kind !== 'exports') throw new Error('unreachable');
    expect(result.symbols).toEqual([{ name: 'x' }]);
    expect(child.sent[0]).toMatchObject({ type: 'c4SourceAnalyze', request: { kind: 'exports' } });
  });

  it('result 無しで異常終了したら reject する', async () => {
    const child = new FakeChild();
    const promise = runC4SourceAnalyze(
      '/fake/analyze-child.js',
      { kind: 'flowchartCall', files: [], symbolId: 's' },
      { fork: () => child as never },
    );
    child.emit('exit', null, 'SIGSEGV');
    await expect(promise).rejects.toThrow(/terminated abnormally/);
  });
});
