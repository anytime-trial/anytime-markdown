import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { CodeGraphService } from '../CodeGraphService';
import { runAnalyzeCurrentCodePipeline } from '../AnalyzePipeline';
import type { AnalyzePipelineCallbacks } from '../AnalyzePipeline';

const APP_PY = `from pkg.models import make_dog


def adopt():
    return make_dog()


def main():
    adopt()
`;
const MODELS_PY = `def make_dog():
    return 1
`;

const noopCallbacks: AnalyzePipelineCallbacks = {
  notifyProgress: () => {},
  notifyCodeGraphProgress: () => {},
  notifyCodeGraphUpdated: jest.fn(),
  // 解析後に C4 モデル更新イベント (model-updated) を viewer へ通知する。
  notifyModelUpdated: jest.fn(),
  // tsconfig 無し経路では呼ばれない（呼ばれたら検知のため失敗させる）。
  computeAndPersistImportance: async () => {
    throw new Error('computeAndPersistImportance must not be called on the Python-only path');
  },
};

describe('runAnalyzeCurrentCodePipeline (Python-only, no tsconfig)', () => {
  it('lights up function analysis and C4 model for a Python-only repo', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'py-only-pipe-'));
    fs.mkdirSync(path.join(repoRoot, 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'app.py'), APP_PY);
    fs.writeFileSync(path.join(repoRoot, 'pkg', '__init__.py'), '');
    fs.writeFileSync(path.join(repoRoot, 'pkg', 'models.py'), MODELS_PY);
    fs.mkdirSync(path.join(repoRoot, 'views'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'views', 'home.py'), 'def index():\n    return "home"\n');
    const repoName = path.basename(repoRoot);

    try {
      const trailDb = await createTestTrailDatabase();
      const codeGraphService = new CodeGraphService({
        repositories: [{ id: repoName, label: repoName, path: repoRoot }],
        trailDb,
      });

      const result = await runAnalyzeCurrentCodePipeline({
        analysisRoot: repoRoot,
        tsconfigPath: undefined,
        trailDb,
        callbacks: noopCallbacks,
        codeGraphService,
      });

      expect(result.repoName).toBe(repoName);

      // 解析後に C4 モデル更新イベント (model-updated) と code-graph-updated の両方を通知する。
      // viewer はこの notifyModelUpdated 経由で C4 モデルを再 fetch する。
      expect(noopCallbacks.notifyModelUpdated).toHaveBeenCalled();
      expect(noopCallbacks.notifyCodeGraphUpdated).toHaveBeenCalled();

      // function analysis に Python 関数が language='python' で入っている
      const fns = trailDb.getCurrentFunctionAnalysis(repoName);
      const adopt = fns.find((f) => f.functionName === 'adopt' && f.filePath === 'app.py');
      expect(adopt).toBeDefined();
      expect(adopt!.language).toBe('python');

      // C4 モデルが TrailGraph から導出される（要素が 1 件以上）
      const c4 = await trailDb.asC4ModelStore().getCurrentC4Model(repoName);
      expect(c4).not.toBeNull();
      expect(c4!.model.elements.length).toBeGreaterThan(0);

      // views/ 配下は PythonFileClassifier で ui に分類される
      const fileRows = trailDb.getCurrentFileAnalysis(repoName);
      const viewRow = fileRows.find((r) => r.filePath === 'views/home.py');
      expect(viewRow).toBeDefined();
      expect(viewRow!.category).toBe('ui');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
