import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { TrailDatabase, InMemoryTrailStorage } from '@anytime-markdown/trail-db';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

import {
  DEFAULT_COMMIT_CODE_GRAPH_RETENTION,
  resolveGitRootForRepo,
  runAnalyzeCommitCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from '../AnalyzePipeline';

// Snapshot per Commit の配線を固定する。TS 解析そのものの実入りは release 側と同じく
// 扱わず、「解析対象がそのコミットの worktree であること」「指定 sha 以外を消さないこと」
// 「失敗を成功と区別できること」を検証する。

const makeCodeGraph = (nodeId = 'n1'): CodeGraph => ({
  generatedAt: '2026-08-04T00:00:00.000Z',
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: [
    {
      id: nodeId,
      label: nodeId,
      repo: 'repo1',
      package: 'pkg',
      fileType: 'code',
      community: 0,
      communityLabel: 'c0',
      x: 0,
      y: 0,
      size: 1,
    },
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

function makeCodeGraphServiceStub(seen: Override[], graphs?: readonly CodeGraph[]): never {
  return {
    getPythonWasmPath: () => undefined,
    generate: async (_onProgress?: unknown, override?: unknown) => {
      if (override) seen.push(override as Override);
      return graphs ?? [makeCodeGraph()];
    },
  } as never;
}

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
  const db = new TrailDatabase('/tmp', new InMemoryTrailStorage(), undefined, {
    info: () => {},
    warn: (msg: string) => warns.push(msg),
    error: () => {},
    debugSql: () => {},
  });
  await db.init();
  return db;
}

const TEST_REPO = 'anytime-markdown';

const seedRepo = (db: TrailDatabase): void => {
  const raw = (db as unknown as { db: { run: (sql: string, p?: unknown[]) => void } }).db;
  raw.run('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
    1,
    TEST_REPO,
    '2026-01-01T00:00:00.000Z',
  ]);
};

const insertRelease = (db: TrailDatabase, tag: string): void => {
  seedRepo(db);
  const raw = (db as unknown as { db: { run: (sql: string, p?: unknown[]) => void } }).db;
  raw.run('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
    tag,
    '2026-01-01T00:00:00.000Z',
    1,
  ]);
};

describe('runAnalyzeCommitCodePipeline', () => {
  let repoDir: string;
  let warns: string[];
  let db: TrailDatabase;
  let firstSha: string;
  let secondSha: string;

  beforeEach(async () => {
    warns = [];
    db = await makeDb(warns);
    seedRepo(db);
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-commit-pipeline-'));
    const git = (...args: string[]): string =>
      execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], {
        cwd: repoDir,
        stdio: 'pipe',
      }).toString();
    git('init', '-q');
    fs.writeFileSync(path.join(repoDir, 'a.ts'), 'export const a = 1;\n');
    git('add', 'a.ts');
    git('commit', '-q', '-m', 'first');
    firstSha = git('rev-parse', 'HEAD').trim();
    fs.writeFileSync(path.join(repoDir, 'b.ts'), 'export const b = 2;\n');
    git('add', 'b.ts');
    git('commit', '-q', '-m', 'second');
    secondSha = git('rev-parse', 'HEAD').trim();
    git('tag', 'v1.0.0');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  const run = (sha: string, seen: Override[], retentionPerRepo?: number) =>
    runAnalyzeCommitCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub(seen),
      gitRoot: repoDir,
      sha,
      repoName: TEST_REPO,
      compute: { kind: 'in-host' },
      retentionPerRepo,
      logger: makeLogger(warns),
    });

  it('analyses the worktree of that commit, not the current checkout', async () => {
    const seen: Override[] = [];

    await run(firstSha, seen);

    expect(seen).toHaveLength(1);
    expect(seen[0].repositories[0].path).not.toBe(repoDir);
    expect(seen[0].repositories[0].path).toContain(`trail-cg-commit-${firstSha}`);
  });

  it('does not persist into the current code graph', async () => {
    const seen: Override[] = [];

    await run(firstSha, seen);

    expect(seen[0].persist).toBe(false);
    // undefined を渡すと trailGraphProvider（現在の TrailGraph）へフォールバックする。
    expect(seen[0].trailGraphByRepoId).toEqual({});
  });

  it('saves the snapshot under the requested repository and sha', async () => {
    const result = await run(firstSha, []);

    expect(result.sha).toBe(firstSha);
    expect(result.nodeCount).toBe(1);
    expect(db.getCommitCodeGraph(firstSha, TEST_REPO)).not.toBeNull();
  });

  it('cleans up the worktree it created', async () => {
    const seen: Override[] = [];

    await run(firstSha, seen);

    expect(fs.existsSync(seen[0].repositories[0].path)).toBe(false);
  });

  // オンデマンド生成で既存キャッシュが飛ぶのが release 経路で起きた事故。
  it('leaves other commit snapshots alone', async () => {
    await run(firstSha, []);
    await run(secondSha, []);

    expect(db.getCommitCodeGraph(firstSha, TEST_REPO)).not.toBeNull();
    expect(db.getCommitCodeGraph(secondSha, TEST_REPO)).not.toBeNull();
  });

  it('leaves release snapshots alone', async () => {
    insertRelease(db, 'v1.0.0');
    await runAnalyzeReleaseCodePipeline({
      trailDb: db,
      codeGraphService: makeCodeGraphServiceStub([]),
      gitRoot: repoDir,
      compute: { kind: 'in-host' },
      scope: { kind: 'all' },
      logger: makeLogger(warns),
    });

    await run(firstSha, []);

    expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
  });

  it('applies the retention limit', async () => {
    await run(firstSha, [], 1);
    await run(secondSha, [], 1);

    expect(db.getCommitCodeGraph(firstSha, TEST_REPO)).toBeNull();
    expect(db.getCommitCodeGraph(secondSha, TEST_REPO)).not.toBeNull();
  });

  it('defaults the retention limit to 30', () => {
    expect(DEFAULT_COMMIT_CODE_GRAPH_RETENTION).toBe(30);
  });

  // 1 件の要求に対する 1 件の応答なので、失敗を warn で流して成功扱いにしない。
  it('throws for an unknown sha instead of reporting success', async () => {
    await expect(run('0000000000000000000000000000000000000000', [])).rejects.toThrow();
  });

  it('throws when no graph could be generated', async () => {
    await expect(
      runAnalyzeCommitCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub([], []),
        gitRoot: repoDir,
        sha: firstSha,
        repoName: TEST_REPO,
        compute: { kind: 'in-host' },
        logger: makeLogger(warns),
      }),
    ).rejects.toThrow(/no code graph generated/);
    expect(db.getCommitCodeGraph(firstSha, TEST_REPO)).toBeNull();
  });

  it('cleans up the worktree even when the analysis fails', async () => {
    const worktreeRoot = path.join(os.tmpdir(), `trail-cg-commit-${firstSha}`);
    await expect(
      runAnalyzeCommitCodePipeline({
        trailDb: db,
        codeGraphService: makeCodeGraphServiceStub([], []),
        gitRoot: repoDir,
        sha: firstSha,
        repoName: TEST_REPO,
        compute: { kind: 'in-host' },
        logger: makeLogger(warns),
      }),
    ).rejects.toThrow();

    expect(fs.existsSync(worktreeRoot)).toBe(false);
  });
});

describe('resolveGitRootForRepo', () => {
  // 保存先は repo が決めるのに解析対象は gitRoot が決めるため、検証せず primary を渡すと
  // 別リポジトリ名で primary の断面が commit_code_graphs に残る。
  it('picks the root whose basename matches the requested repo', () => {
    const roots = ['/work/anytime-markdown', '/work/anytime-trade'];

    expect(resolveGitRootForRepo(roots, 'anytime-trade')).toBe('/work/anytime-trade');
  });

  it('returns null for a repo that is not configured (does not fall back to the primary)', () => {
    const roots = ['/work/anytime-markdown', '/work/anytime-trade'];

    expect(resolveGitRootForRepo(roots, 'not-configured')).toBeNull();
  });

  it('returns null when no roots are configured', () => {
    expect(resolveGitRootForRepo([], 'anytime-markdown')).toBeNull();
  });
});
