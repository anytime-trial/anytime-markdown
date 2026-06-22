// 回帰: doc-core ランナーは cli.ts (standalone CLI) にしか配線されておらず、拡張が fork する
// trail-daemon child process (trailDaemonEntry.ts) には配線が漏れていた。そのため VS Code 拡張
// 経由では lep.json の sources.docs.root が設定済みでも doc-core.db が一切作られなかった。
// configure() が cfg.docCore.docsRoot を受けて doc-core ランナーを配線することを保証する。

// 重い native dep を持つモジュールは差し替える (analyze.test.ts と同方針)。
jest.mock('@anytime-markdown/trail-db', () => ({
  TrailDatabase: jest.fn().mockImplementation(() => ({
    init: jest.fn(async () => {}),
    close: jest.fn(),
  })),
}));

jest.mock('../../server/TrailDataServer', () => ({
  TrailDataServer: jest.fn().mockImplementation(() => ({
    setCodeGraphService: jest.fn(),
    setAnalyzeAllRunner: jest.fn(),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    port: 19842,
  })),
}));

jest.mock('../../analyze/CodeGraphService', () => ({
  CodeGraphService: jest.fn().mockImplementation(() => ({})),
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { _getDocCoreWiredForTest, _resetForTest, dispatch } from '../trailDaemonEntry';

function makeCfg(overrides: Record<string, unknown>) {
  return {
    trailDbPath: '/tmp/trail.db',
    gitRoot: '/tmp/repo',
    statePath: '/tmp/state',
    stage: 'all' as const,
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    importAllStatusFilePath: '/tmp/import-status.json',
    pipelineStatusFilePath: '/tmp/pipeline-status.json',
    memoryCore: null,
    ...overrides,
  };
}

describe('trailDaemonEntry.configure — doc-core 配線', () => {
  let dir: string;

  beforeEach(() => {
    _resetForTest();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-doc-core-'));
    fs.mkdirSync(path.join(dir, 'spec', '10.sample'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'spec', '10.sample', 'sample.ja.md'),
      '---\ntitle: sample\ncategory: sample\n---\n\nsample body\n',
      'utf8',
    );
  });

  afterEach(async () => {
    // setInterval を確実に解除するため dispose を通す (disposeAll が docCoreWired を dispose)。
    await dispatch('dispose', undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('cfg.docCore.docsRoot 設定時に doc-core ランナーを配線する', async () => {
    const trailDbPath = path.join(dir, 'db', 'trail.db');
    await dispatch(
      'configure',
      makeCfg({
        trailDbPath,
        docCore: { docsRoot: dir, embedModel: 'bge-m3' },
      }),
    );
    expect(_getDocCoreWiredForTest()).not.toBeNull();
    // doc-core.db は trail.db と同じ DB ディレクトリに生成される。
    expect(fs.existsSync(path.join(dir, 'db', 'doc-core.db'))).toBe(true);
  });

  it('cfg.docCore 未指定なら doc-core は無効 (null)', async () => {
    await dispatch('configure', makeCfg({}));
    expect(_getDocCoreWiredForTest()).toBeNull();
  });

  it('cfg.docCore.docsRoot が空文字なら doc-core は無効 (null)', async () => {
    await dispatch('configure', makeCfg({ docCore: { docsRoot: '   ', embedModel: 'bge-m3' } }));
    expect(_getDocCoreWiredForTest()).toBeNull();
  });

  it('docCore 付き再 configure で旧ランナーを dispose し再配線する', async () => {
    const cfg = makeCfg({
      trailDbPath: path.join(dir, 'db', 'trail.db'),
      docCore: { docsRoot: dir, embedModel: 'bge-m3' },
    });
    await dispatch('configure', cfg);
    const first = _getDocCoreWiredForTest();
    expect(first).not.toBeNull();
    await dispatch('configure', cfg);
    const second = _getDocCoreWiredForTest();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });
});
