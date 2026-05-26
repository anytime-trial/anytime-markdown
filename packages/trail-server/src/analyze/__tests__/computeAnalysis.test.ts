import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { computeAnalysis } from '../computeAnalysis';

describe('computeAnalysis', () => {
  it('小規模 TS リポジトリの graph と scored を計算し serializable な結果を返す', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export function f(x: number) { return x * 2; }\n');
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }),
    );
    const result = await computeAnalysis({
      analysisRoot: dir,
      tsconfigPath: path.join(dir, 'tsconfig.json'),
    });
    expect(result.graph.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.lineCountByFile)).toBe(true); // Map ではなく entries 配列
    // structuredClone 可能（IPC で渡せる）こと
    expect(() => structuredClone(result)).not.toThrow();
  });
});
