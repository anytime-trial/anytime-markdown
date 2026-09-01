import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { CodeGraphService } from '../CodeGraphService';
import { runAnalyzeCurrentCodePipeline } from '../AnalyzePipeline';
import type { AnalyzePipelineCallbacks } from '../AnalyzePipeline';

/**
 * 混在リポジトリ（frontend=TS + backend=Python）の current 解析リグレッション。
 *
 * tsconfig が frontend/ 配下にある場合でも、TrailGraph は
 * - リポジトリルート基準のパス空間（file::frontend/... / file::backend/...）で保存され、
 * - Python のノード・エッジを含む
 * ことを検証する。従来は TS 経路固定で projectRoot=frontend・Python ノード 0 件だった
 * （/Shared/anytime-trade-tmp で実測）。
 */

const UTIL_TS = `export function greet(name: string): string {
  return 'hello ' + name;
}
`;
const APP_TS = `import { greet } from './util';

export function main(): string {
  return greet('trade');
}
`;
const APP_PY = `from pkg.models import make_dog


def adopt():
    return make_dog()
`;
const MODELS_PY = `def make_dog():
    return 1
`;

const TSCONFIG = JSON.stringify({
  compilerOptions: { module: 'commonjs', target: 'es2020', strict: true },
  include: ['src'],
});

const noopCallbacks: AnalyzePipelineCallbacks = {
  notifyProgress: () => {},
  notifyCodeGraphProgress: () => {},
  notifyCodeGraphUpdated: jest.fn(),
  notifyModelUpdated: jest.fn(),
};

describe('runAnalyzeCurrentCodePipeline (mixed repo: frontend tsconfig + backend Python)', () => {
  it('saves a root-based TrailGraph containing both TS and Python nodes', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-pipe-'));
    const feSrc = path.join(repoRoot, 'frontend', 'src');
    fs.mkdirSync(feSrc, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'frontend', 'tsconfig.json'), TSCONFIG);
    fs.writeFileSync(path.join(feSrc, 'util.ts'), UTIL_TS);
    fs.writeFileSync(path.join(feSrc, 'app.ts'), APP_TS);
    const bePkg = path.join(repoRoot, 'backend', 'pkg');
    fs.mkdirSync(bePkg, { recursive: true });
    // backend は pyproject.toml をマーカーに持つ独立 Python プロジェクト
    // （anytime-trade-tmp の実構成。絶対 import はマーカールート基準で解決される）
    fs.writeFileSync(path.join(repoRoot, 'backend', 'pyproject.toml'), '[project]\nname = "be"\n');
    fs.writeFileSync(path.join(repoRoot, 'backend', 'app.py'), APP_PY);
    fs.writeFileSync(path.join(bePkg, '__init__.py'), '');
    fs.writeFileSync(path.join(bePkg, 'models.py'), MODELS_PY);
    const repoName = path.basename(repoRoot);

    try {
      const trailDb = await createTestTrailDatabase();
      const codeGraphService = new CodeGraphService({
        repositories: [{ id: repoName, label: repoName, path: repoRoot }],
        trailDb,
      });

      await runAnalyzeCurrentCodePipeline({
        analysisRoot: repoRoot,
        tsconfigPath: path.join(repoRoot, 'frontend', 'tsconfig.json'),
        compute: { kind: 'in-host' },
        trailDb,
        callbacks: noopCallbacks,
        codeGraphService,
      });

      const graph = trailDb.getCurrentGraph(repoName);
      expect(graph).not.toBeNull();

      // パス空間はリポジトリルート基準（file_analysis / コードグラフと突合可能）
      expect(graph!.metadata.projectRoot).toBe(repoRoot);

      const ids = graph!.nodes.map((n) => n.id);
      // TS ノードは frontend/ プレフィクス付きで入る
      expect(ids).toContain('file::frontend/src/app.ts');
      expect(ids).toContain('file::frontend/src/util.ts');
      // Python ノードも同じ graph に入る（従来 0 件だった欠落の regression）
      expect(ids).toContain('file::backend/app.py');
      expect(ids).toContain('file::backend/pkg/models.py');

      // TS の import エッジの端点も rebase 済み
      const importEdge = graph!.edges.find(
        (e) => e.type === 'import' && e.source === 'file::frontend/src/app.ts',
      );
      expect(importEdge).toBeDefined();
      expect(importEdge!.target).toBe('file::frontend/src/util.ts');

      // Python の import エッジ（app.py → pkg/models.py）も入る
      const pyEdge = graph!.edges.find(
        (e) => e.source === 'file::backend/app.py' && e.target === 'file::backend/pkg/models.py',
      );
      expect(pyEdge).toBeDefined();

      // filePath もルート基準
      const pyNode = graph!.nodes.find((n) => n.id === 'file::backend/app.py');
      expect(pyNode!.filePath).toBe('backend/app.py');
      const tsNode = graph!.nodes.find((n) => n.id === 'file::frontend/src/app.ts');
      expect(tsNode!.filePath).toBe('frontend/src/app.ts');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 120_000);
});
