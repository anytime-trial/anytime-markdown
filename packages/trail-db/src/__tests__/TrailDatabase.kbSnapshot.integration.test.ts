// Phase 5 S3 (KB Persistence) 疑似実機（受け入れ基準 §11-3）:
// tmpdir の実ファイル DB で snapshot 生成 → shrink 警告 → 復元の一連 lifecycle を検証する。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

import type { TrailDatabase } from '../TrailDatabase';
import { createFileBackedTestDb } from './support/createTestDb';

const TS = '2026-07-16T10:00:00.000Z';

const makeCodeGraph = (nodeCount: number): CodeGraph => ({
  generatedAt: TS,
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node${i}`,
    repo: 'repo1',
    package: 'pkg',
    fileType: 'code' as const,
    community: 0,
    communityLabel: 'c0',
    x: 0,
    y: 0,
    size: 1,
  })),
  edges: [],
  communities: { 0: 'Community A' },
  godNodes: [],
});

/** デバウンスを跨いだ扱いにするため、最新世代の mtime を過去へずらす */
const ageLatestSnapshot = (dbPath: string, minutes: number): void => {
  const kb1 = `${dbPath}.kb.1.gz`;
  const past = new Date(Date.now() - minutes * 60 * 1000);
  fs.utimesSync(kb1, past, past);
};

describe('TrailDatabase KB persistence integration (real file lifecycle)', () => {
  let dir: string;
  let dbPath: string;
  let db: TrailDatabase;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-integration-'));
    dbPath = path.join(dir, 'trail.db');
    db = await createFileBackedTestDb(dir);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // 既に close 済みのケースは検証対象外のため無視する
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('破壊的書込で trail.db.kb.1.gz が生成され、縮小で emergency_log に警告が入り、復元で総数が回復する', async () => {
    // (1) 初回の破壊的書込で snapshot が生成される
    db.saveCurrentCodeGraph('repo1', makeCodeGraph(100));
    expect(fs.existsSync(`${dbPath}.kb.1.gz`)).toBe(true);

    // (2) デバウンスを跨がせてから縮小書込 → 新世代 snapshot（100 ノード時点）+ shrink 警告
    ageLatestSnapshot(dbPath, 11);
    db.saveCurrentCodeGraph('repo1', makeCodeGraph(10));
    const shrinks = db
      .listEmergencyEvents()
      .filter((e) => e.event === 'anomaly_detected' && (JSON.parse(e.detailJson) as { kind?: string }).kind === 'kb_shrink');
    expect(shrinks).toHaveLength(1);
    expect(db.listKnowledgeBaseSnapshots().length).toBeGreaterThanOrEqual(2);

    // (3) 最新世代（100 ノード時点の状態）から復元 → close → ファイル復元 → 再 init が
    //     一体で行われ、同じインスタンスから縮小前の総数が読める
    await db.restoreKnowledgeBaseSnapshot(1);
    const restored = db.getCurrentCodeGraph('repo1');
    expect(restored?.nodes).toHaveLength(100);

    // (4) 復元の監査記録が復元後のアクティブ DB に残る
    const restores = db
      .listEmergencyEvents()
      .filter((e) => e.event === 'rollback_executed' && (JSON.parse(e.detailJson) as { kind?: string }).kind === 'kb_restore');
    expect(restores).toHaveLength(1);

    // (5) 復元結果はファイルにも永続化されている（開き直しても同じ）
    db.close();
    const reopened = await createFileBackedTestDb(dir);
    try {
      expect(reopened.getCurrentCodeGraph('repo1')?.nodes).toHaveLength(100);
    } finally {
      reopened.close();
    }
  });

  it('デバウンス内の連続書込では snapshot 世代が増えない', () => {
    db.saveCurrentCodeGraph('repo1', makeCodeGraph(30));
    db.saveCurrentGraph(
      { nodes: [], edges: [], metadata: { projectRoot: '/repo1', analyzedAt: TS } } as never,
      '/t',
      'c'.repeat(40),
      'repo1',
    );
    expect(db.listKnowledgeBaseSnapshots()).toHaveLength(1);
  });
});
