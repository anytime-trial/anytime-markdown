/**
 * 解析パイプラインが boundary drift 判定を実際に呼ぶことの回帰テスト（T3 の結線）。
 *
 * recordBoundaryDrift 単体のテストは同ステップの中身を見るだけで、
 * パイプラインからの呼び出しが消えても落ちない（fail-open なので実行時も静かに止まる）。
 * ここでは実 DB で通しの経路を踏み、呼び出しの実在と DB 契約の一致を同時に見る。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { CodeGraphService } from '../CodeGraphService';
import { runAnalyzeCurrentCodePipeline } from '../AnalyzePipeline';
import type { AnalyzePipelineCallbacks } from '../AnalyzePipeline';
import * as recordBoundaryDriftModule from '../recordBoundaryDrift';

const noopCallbacks: AnalyzePipelineCallbacks = {
  notifyProgress: () => {},
  notifyCodeGraphProgress: () => {},
  notifyCodeGraphUpdated: () => {},
  notifyModelUpdated: () => {},
};

describe('runAnalyzeCurrentCodePipeline — boundary drift 結線', () => {
  it('コードグラフ生成後に判定を呼び、実 DB への保存が失敗しない', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-pipe-'));
    fs.mkdirSync(path.join(repoRoot, 'pkg'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'app.py'),
      'from pkg.models import make_dog\n\n\ndef adopt():\n    return make_dog()\n',
    );
    fs.writeFileSync(path.join(repoRoot, 'pkg', '__init__.py'), '');
    fs.writeFileSync(path.join(repoRoot, 'pkg', 'models.py'), 'def make_dog():\n    return 1\n');
    const repoName = path.basename(repoRoot);
    const spy = jest.spyOn(recordBoundaryDriftModule, 'recordBoundaryDrift');

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

      expect(spy).toHaveBeenCalledTimes(1);
      // 生成済みのコードグラフ（community 付与済み）を渡していること。
      const args = spy.mock.calls[0][0];
      expect(args.repoName).toBe(repoName);
      expect(args.graph?.nodes.length ?? 0).toBeGreaterThan(0);

      // fail-open なので失敗しても例外にはならない。warnings に痕跡が出ていないことで
      // 実 DB 契約（repoIdForName / recordBoundaryDriftWarnings）との一致を確かめる。
      expect(result.warnings.filter((w) => w.includes('boundary drift'))).toEqual([]);

      // 単一パッケージの極小リポなので警告は出ない（照会自体は成立する）。
      const rows = trailDb.listBoundaryDriftWarnings({
        repoId: trailDb.repoIdForName(repoName),
      });
      expect(rows).toEqual([]);
    } finally {
      spy.mockRestore();
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
