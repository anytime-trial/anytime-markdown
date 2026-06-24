/**
 * generateForRepo() がノードへアーキテクチャ層 (layer) を注釈することのリグレッションテスト。
 * resolveLayers が実 package.json を読むため、tmp モノレポ fixture を用意する。
 */

jest.mock('@anytime-markdown/code-analysis-typescript/analyze', () => ({
  analyze: jest.fn(() => ({ nodes: [], edges: [], metadata: { projectRoot: '/tmp/repo', analyzedAt: '2026-01-01', fileCount: 0 } })),
}));
jest.mock('@anytime-markdown/trail-core/analyzeExclude', () => ({
  loadAnalyzeExclude: jest.fn(() => {
    const ignore = require('ignore');
    return ignore();
  }),
}));

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { CodeGraphService } from '../CodeGraphService';
import type { TrailGraph } from '@anytime-markdown/trail-core';

function writePkg(repoRoot: string, pkg: string, json: Record<string, unknown>): void {
  const dir = path.join(repoRoot, 'packages', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json), 'utf8');
}

describe('CodeGraphService generateForRepo() — layer 注釈', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-layer-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('各ノードへ package 単位で解決した layer を付与する', async () => {
    writePkg(tmpDir, 'sample-db', {
      name: '@anytime-markdown/sample-db',
      dependencies: { 'better-sqlite3': '12.4.1' },
    });
    writePkg(tmpDir, 'sample-viewer', { name: '@anytime-markdown/sample-viewer' });

    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::packages/sample-db/src/db.ts', label: 'db', type: 'file', filePath: 'packages/sample-db/src/db.ts', line: 1 },
        { id: 'file::packages/sample-viewer/src/view.ts', label: 'view', type: 'file', filePath: 'packages/sample-viewer/src/view.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 2 },
    };

    const svc = new CodeGraphService({
      repositories: [{ id: 'sample', label: 'sample', path: tmpDir }],
      trailGraphProvider: () => ({ sample: trailGraph }),
      trailDb: { getCurrentCodeGraph: jest.fn(), saveCurrentCodeGraph: jest.fn() } as never,
    });

    const graph = (await svc.generate())[0];
    const dbNode = graph.nodes.find((n) => n.package === 'sample-db');
    const viewerNode = graph.nodes.find((n) => n.package === 'sample-viewer');
    expect(dbNode?.layer).toBe('data');
    expect(viewerNode?.layer).toBe('presentation-ui');
  });

  it('package.json が無い未知 package は utility 層へ degrade する', async () => {
    // packages/<pkg> ディレクトリも package.json も無い → name-only manifest で分類される。
    // root 直下ファイル（segments[1] 不在）は package=repoId となり、命名規則に当たらず utility。
    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::README', label: 'README', type: 'file', filePath: 'README.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };
    const svc = new CodeGraphService({
      repositories: [{ id: 'sample', label: 'sample', path: tmpDir }],
      trailGraphProvider: () => ({ sample: trailGraph }),
      trailDb: { getCurrentCodeGraph: jest.fn(), saveCurrentCodeGraph: jest.fn() } as never,
    });
    const graph = (await svc.generate())[0];
    // 'README.ts' → segments=['README'] → package=repoId='sample'。utility 層に分類される。
    expect(graph.nodes[0].package).toBe('sample');
    expect(graph.nodes[0].layer).toBe('utility');
  });

  it('generate() 後に層 C4 コンテナを auto シードする（手動要素なしの repo）', async () => {
    writePkg(tmpDir, 'sample-db', {
      name: '@anytime-markdown/sample-db',
      dependencies: { 'better-sqlite3': '12.4.1' },
    });
    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::packages/sample-db/src/db.ts', label: 'db', type: 'file', filePath: 'packages/sample-db/src/db.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };
    const saveManualElement = jest.fn();
    const db = {
      getCurrentCodeGraph: jest.fn(),
      saveCurrentCodeGraph: jest.fn(),
      getManualElements: jest.fn(() => []),
      saveManualElement,
    };
    const svc = new CodeGraphService({
      repositories: [{ id: 'sample', label: 'sample', path: tmpDir }],
      trailGraphProvider: () => ({ sample: trailGraph }),
      trailDb: db as never,
    });
    await svc.generate();
    // data 層コンテナが auto シードされる。
    expect(saveManualElement).toHaveBeenCalledTimes(1);
    const [, input] = saveManualElement.mock.calls[0];
    expect(input).toMatchObject({ type: 'container', name: 'data', serviceType: 'auto-layer' });
  });
});
