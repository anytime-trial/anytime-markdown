import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AnalyzeChildRunner } from '../AnalyzeChildRunner';
import type { AnalyzeComputeResult } from '../analyzeChildProtocol';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  send(msg: unknown) {
    this.sent.push(msg);
  }
  kill() {}
}

const minimalResult: AnalyzeComputeResult = {
  graph: { nodes: [], edges: [], metadata: { projectRoot: '/r', analyzedAt: 'x', fileCount: 0 } } as never,
  scored: [],
  lineCountByFile: [],
  warnings: [],
};

function writeResult(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-'));
  const p = path.join(dir, 'result.json');
  fs.writeFileSync(p, JSON.stringify(minimalResult));
  return p;
}

describe('AnalyzeChildRunner', () => {
  it('result メッセージを受けて結果を返し、進捗を転送する', async () => {
    const child = new FakeChild();
    const progress: string[] = [];
    const runner = new AnalyzeChildRunner('/fake/analyze-child.js', {
      fork: () => child as never,
      onProgress: (phase) => progress.push(phase),
    });
    const promise = runner.run({ analysisRoot: '/r', tsconfigPath: '/r/tsconfig.json' });
    child.emit('message', { type: 'progress', phase: 'Loading project...', percent: 0 });
    child.emit('message', { type: 'result', resultPath: writeResult() });
    child.emit('exit', 0, null);
    const result = await promise;
    expect(result.graph.nodes).toEqual([]);
    expect(progress).toContain('Loading project...');
  });

  it('SIGSEGV で 1 回リトライし、2 回目成功で結果を返す（ホストは throw しない）', async () => {
    const children = [new FakeChild(), new FakeChild()];
    let i = 0;
    const runner = new AnalyzeChildRunner('/fake/analyze-child.js', {
      fork: () => children[i++] as never,
    });
    const promise = runner.run({ analysisRoot: '/r', tsconfigPath: '/r/tsconfig.json' });
    children[0].emit('exit', null, 'SIGSEGV');
    await new Promise((r) => setImmediate(r));
    children[1].emit('message', { type: 'result', resultPath: writeResult() });
    children[1].emit('exit', 0, null);
    const result = await promise;
    expect(result.graph.nodes).toEqual([]);
    expect(i).toBe(2);
  });

  it('2 回連続 SIGSEGV で構造化エラーを reject する', async () => {
    const children = [new FakeChild(), new FakeChild()];
    let i = 0;
    const runner = new AnalyzeChildRunner('/fake/analyze-child.js', { fork: () => children[i++] as never });
    const promise = runner.run({ analysisRoot: '/r', tsconfigPath: '/r/tsconfig.json' });
    children[0].emit('exit', null, 'SIGSEGV');
    await new Promise((r) => setImmediate(r));
    children[1].emit('exit', null, 'SIGSEGV');
    await expect(promise).rejects.toThrow(/SIGSEGV/);
  });
});
