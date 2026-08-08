import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { CodeGraph } from '@anytime-markdown/trail-activity/codeGraph';

import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { runAnalyzeReleaseCodePipeline } from '../AnalyzePipeline';

// release 遡及生成の配線を固定する。TS 解析そのものの実入りは重いので本テストでは扱わず、
// 「解析対象がタグの worktree であること」「current を汚さないこと」「失敗が記録されること」
// を検証する（実入りは 1 タグの実測で確認する）。

const makeCodeGraph = (): CodeGraph => ({
  generatedAt: '2026-05-02T00:00:00.000Z',
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: [
    { id: 'n1', label: 'Node1', repo: 'repo1', package: 'pkg', fileType: 'code', community: 0, communityLabel: 'c0', x: 0, y: 0, size: 1 },
  ],
  edges: [],
  communities: { 0: 'Community A' },
  godNodes: [],
});

type Override = {
  repositories: readonly { path: string }[];
  trailGraphByRepoId?: Record<string, unknown>;
  persist?: boolean;
};

/** generate の引数だけを捕まえるスタブ。CodeGraphService の実体は使わない。 */
function makeCodeGraphServiceStub(seen: Override[]): never {
  return {
    getPythonWasmPath: () => undefined,
    generate: async (_onProgress?: unknown, override?: unknown) => {
      if (override) seen.push(override as Override);
      return [makeCodeGraph()];
    },
  } as never;
}

/** trail-server の Logger スタブ（pipeline へ渡す。DbLogger とは別インターフェース）。 */
function makeLogger(warns: string[]): never {
  const logger: Record<string, unknown> = {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => warns.push(msg),
    error: () => {},
  };
  logger.child = () => logger;
  return logger as never;
}

async function makeDb(warns: string[]): Promise<TrailDatabase> {
  return createTestTrailDatabase({
    info: () => {},
    warn: (msg: string) => warns.push(msg),
    error: () => {},
    debugSql: () => {},
  });
}

const TEST_REPO = 'anytime-markdown';

// 履歴版グラフの read は repo 名を必須で受ける（タグは repo 内でしか一意でない）。
// fixture 側も repos 行と repo_id を持たせる。
const insertRelease = (db: TrailDatabase, tag: string): void => {
  const raw = (db as unknown as { db: { run: (sql: string, p?: unknown[]) => void } }).db;
  raw.run('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
    1, TEST_REPO, '2026-01-01T00:00:00.000Z',
  ]);
  raw.run(
    'INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)',
    [tag, '2026-01-01T00:00:00.000Z', 1],
  );
};

describe('runAnalyzeReleaseCodePipeline', () => {
  let repoDir: string;
  let warns: string[];
  let db: TrailDatabase;

  beforeEach(async () => {
    warns = [];
    db = await makeDb(warns);
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-release-pipeline-'));
    const git = (...args: string[]): void => {
      execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], {
        cwd: repoDir,
        stdio: 'pipe',
      });
    };
    git('init', '-q');
    fs.writeFileSync(path.join(repoDir, 'a.ts'), 'export const a = 1;\n');
    git('add', 'a.ts');
    git('commit', '-q', '-m', 'init');
    git('tag', 'v1.0.0');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('releases が無いときは何もせず 0 件で返す', async () => {
    const seen: Override[] = [];
    const result = await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });
    expect(result.releaseCount).toBe(0);
    expect(seen).toHaveLength(0);
  });

  // 回帰: タグごとに worktree を作りながら generate() へ渡しておらず、全リリースに
  // 「現在のコード」のグラフが保存される状態だった。
  it('generate() へタグの worktree を渡し、current へは保存させない', async () => {
    insertRelease(db, 'v1.0.0');
    const seen: Override[] = [];
    const result = await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });

    expect(result.releaseCount).toBe(1);
    expect(seen).toHaveLength(1);
    // 解析対象は gitRoot（現在のチェックアウト）ではなく、そのタグの worktree
    expect(seen[0].repositories[0].path).not.toBe(repoDir);
    expect(seen[0].repositories[0].path).toContain('trail-cg-release-v1.0.0');
    // release 用の生成なので current_code_graphs へは保存させない
    expect(seen[0].persist).toBe(false);
    // tsconfig.json が無い worktree なので TS 解析は行われない。それでも
    // trailGraphProvider（現在の TrailGraph を返す）へフォールバックさせない。
    expect(seen[0].trailGraphByRepoId).toEqual({});
    // 生成結果は release 側へ保存される
    expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
  });

  it('worktree を後片付けする', async () => {
    insertRelease(db, 'v1.0.0');
    const seen: Override[] = [];
    await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });
    expect(fs.existsSync(seen[0].repositories[0].path)).toBe(false);
  });

  // 解析対象をタグの worktree にした結果、古いタグが正当に失敗する経路が現実に生じる。
  // 戻り値は成功件数しか持たないため、失敗の痕跡がログに残ることを固定する。
  it('タグごとの失敗をログに残す', async () => {
    insertRelease(db, 'no-such-tag');
    const seen: Override[] = [];
    const result = await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });
    expect(result.releaseCount).toBe(0);
    expect(warns.some((m) => m.includes('no-such-tag'))).toBe(true);
  });

  // scope: tags — 直近 N 本の生成（供給方針 手順 3）とオンデマンド生成（手順 4）の土台。
  // 「対象外のタグを巻き込んで消さない」ことが要点で、ここが壊れるとオンデマンド生成の
  // たびに既存キャッシュが飛ぶ。
  describe('scope: tags', () => {
    it('指定したタグだけを解析し、他タグは対象にしない', async () => {
      insertRelease(db, 'v1.0.0');
      insertRelease(db, 'v0.9.0');
      const seen: Override[] = [];
      const result = await runAnalyzeReleaseCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub(seen),
        gitRoot: repoDir,
        compute: { kind: 'in-host' },
        scope: { kind: 'tags', tags: ['v1.0.0'] },
        logger: makeLogger(warns),
      });
      expect(result.releaseCount).toBe(1);
      expect(seen).toHaveLength(1);
      expect(seen[0].repositories[0].path).toContain('trail-cg-release-v1.0.0');
    });

    it('対象外タグの既存グラフを消さない', async () => {
      insertRelease(db, 'v1.0.0');
      insertRelease(db, 'v0.9.0');
      db.saveReleaseCodeGraph('v0.9.0', makeCodeGraph());

      const seen: Override[] = [];
      await runAnalyzeReleaseCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub(seen),
        gitRoot: repoDir,
        compute: { kind: 'in-host' },
        scope: { kind: 'tags', tags: ['v1.0.0'] },
        logger: makeLogger(warns),
      });
      // 対象タグは再生成され、対象外は残る
      expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
      expect(db.getReleaseCodeGraph('v0.9.0', TEST_REPO)).not.toBeNull();
    });

    it('releases に無いタグは warn に残す', async () => {
      insertRelease(db, 'v1.0.0');
      const seen: Override[] = [];
      const result = await runAnalyzeReleaseCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub(seen),
        gitRoot: repoDir,
        compute: { kind: 'in-host' },
        scope: { kind: 'tags', tags: ['v1.0.0', 'v9.9.9'] },
        logger: makeLogger(warns),
      });
      expect(result.releaseCount).toBe(1);
      expect(warns.some((m) => m.includes('v9.9.9'))).toBe(true);
    });

    it('空配列は「対象 0 件」であり、全量洗い替えに落ちない', async () => {
      insertRelease(db, 'v1.0.0');
      db.saveReleaseCodeGraph('v1.0.0', makeCodeGraph());

      const seen: Override[] = [];
      const result = await runAnalyzeReleaseCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub(seen),
        gitRoot: repoDir,
        compute: { kind: 'in-host' },
        scope: { kind: 'tags', tags: [] },
        logger: makeLogger(warns),
      });
      expect(result.releaseCount).toBe(0);
      expect(seen).toHaveLength(0);
      expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
    });
  });

  it('既存 release_code_graphs を洗い替える', async () => {
    insertRelease(db, 'v1.0.0');
    db.saveReleaseCodeGraph('v1.0.0', makeCodeGraph());
    expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();

    const seen: Override[] = [];
    await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });
    // 削除 → 再生成の順で、最終的に 1 件保存されている
    expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
  });
});
