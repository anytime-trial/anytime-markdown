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

      // fail-open は失敗を例外にしないので、失敗の痕跡は warnings 側にしか出ない。
      // 文言依存を避けるため配列全体が空であることを見る。
      expect(result.warnings).toEqual([]);

      // 実 DB 契約（repoIdForName / recordBoundaryDriftWarnings）が噛み合ったことを、
      // 検出回が 1 件記録されたという肯定形で確かめる。単一パッケージの極小リポなので
      // 警告そのものは 0 件で、「解析済みかつ健全」がこの行で表現される。
      const repoId = trailDb.repoIdForName(repoName);
      const runs = trailDb.listBoundaryDriftRuns({ repoId });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ detectedAt: args.graph?.generatedAt, warningCount: 0 });
      expect(runs[0].nodeCount).toBeGreaterThan(0);
      expect(trailDb.listBoundaryDriftWarnings({ repoId })).toEqual([]);
    } finally {
      spy.mockRestore();
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it('コードグラフ生成が失敗した回は判定しない（前回キャッシュで記録しない）', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-pipe-fail-'));
    fs.writeFileSync(path.join(repoRoot, 'app.py'), 'def adopt():\n    return 1\n');
    const repoName = path.basename(repoRoot);
    const spy = jest.spyOn(recordBoundaryDriftModule, 'recordBoundaryDrift');

    try {
      const trailDb = await createTestTrailDatabase();
      const codeGraphService = new CodeGraphService({
        repositories: [{ id: repoName, label: repoName, path: repoRoot }],
        trailDb,
      });
      // 生成のみ失敗させる。getGraph() は cache を返すだけなので、この分岐を守らないと
      // 前回グラフに対する判定が「今回の検出回」として記録される。
      jest
        .spyOn(codeGraphService, 'generate')
        .mockRejectedValue(new Error('code graph generation exploded'));

      const result = await runAnalyzeCurrentCodePipeline({
        analysisRoot: repoRoot,
        tsconfigPath: undefined,
        trailDb,
        callbacks: noopCallbacks,
        codeGraphService,
      });

      expect(spy).not.toHaveBeenCalled();
      // 生成失敗自体は fail-open で warnings に残る（沈黙しない）ことも同時に確認する。
      expect(result.warnings.some((w) => w.includes('code graph generation failed'))).toBe(true);
      expect(trailDb.listBoundaryDriftRuns({ repoId: trailDb.repoIdForName(repoName) })).toEqual([]);
    } finally {
      spy.mockRestore();
      jest.restoreAllMocks();
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
