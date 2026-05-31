import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeChildAnalyzeFn } from '../childAnalyzeFn';
import type { AnalyzeComputeResult } from '../analyzeChildProtocol';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  send(msg: unknown) {
    this.sent.push(msg);
  }
  kill() {}
}

const minimalResult: AnalyzeComputeResult = {
  graph: {
    nodes: [{ id: 'n1' }],
    edges: [],
    metadata: { projectRoot: '/repo', analyzedAt: 'x', fileCount: 1 },
  } as never,
  scored: [],
  lineCountByFile: [],
  warnings: [],
};

function writeResult(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
  const p = path.join(dir, 'result.json');
  fs.writeFileSync(p, JSON.stringify(minimalResult));
  return p;
}

describe('makeChildAnalyzeFn', () => {
  it('AnalyzeOptions を AnalyzeChildRequest に変換して child へ送り、result.graph を返す', async () => {
    const child = new FakeChild();
    const analyzeFn = makeChildAnalyzeFn('/fake/analyze-child.js', {
      fork: () => child as never,
      pythonWasmPath: '/wasm/tree-sitter-python.wasm',
    });

    const promise = analyzeFn({ tsconfigPath: '/repo/proj/tsconfig.json' });
    child.emit('message', { type: 'result', resultPath: writeResult() });
    child.emit('exit', 0, null);
    const graph = await promise;

    // 戻りは TrailGraph（result.graph）のみ
    expect(graph.nodes).toEqual([{ id: 'n1' }]);

    // analysisRoot / excludeRoot は tsconfigPath の dirname、pythonWasmPath は注入値
    expect(child.sent).toHaveLength(1);
    expect(child.sent[0]).toEqual({
      type: 'analyze',
      request: {
        analysisRoot: path.dirname('/repo/proj/tsconfig.json'),
        excludeRoot: path.dirname('/repo/proj/tsconfig.json'),
        tsconfigPath: '/repo/proj/tsconfig.json',
        pythonWasmPath: '/wasm/tree-sitter-python.wasm',
      },
    });
  });

  it('AnalyzeFunction として同期 analyze と差し替え可能（Promise<TrailGraph> を返す）', async () => {
    const child = new FakeChild();
    const analyzeFn = makeChildAnalyzeFn('/fake/analyze-child.js', { fork: () => child as never });
    const promise = analyzeFn({ tsconfigPath: '/r/tsconfig.json' });
    expect(promise).toBeInstanceOf(Promise);
    child.emit('message', { type: 'result', resultPath: writeResult() });
    child.emit('exit', 0, null);
    await promise;
  });
});
