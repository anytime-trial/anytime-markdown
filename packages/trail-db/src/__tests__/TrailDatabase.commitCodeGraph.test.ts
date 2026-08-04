import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const TEST_REPO = 'anytime-markdown';
const OTHER_REPO = 'anytime-trade';

const makeCodeGraph = (nodeId: string, generatedAt: string): CodeGraph => ({
  generatedAt,
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

const seedRepos = (db: TrailDatabase): void => {
  inner(db).run('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
    1,
    TEST_REPO,
    '2026-01-01T00:00:00.000Z',
  ]);
  inner(db).run('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
    2,
    OTHER_REPO,
    '2026-01-01T00:00:00.000Z',
  ]);
};

const insertRelease = (db: TrailDatabase, tag: string, releasedAt: string, repoId = 1): void => {
  inner(db).run('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
    tag,
    releasedAt,
    repoId,
  ]);
};

const insertCommit = (
  db: TrailDatabase,
  sessionId: string,
  sha: string,
  committedAt: string,
  message: string,
  repoId = 1,
): void => {
  inner(db).run(
    "INSERT OR IGNORE INTO sessions (id, start_time) VALUES (?, '2026-01-01T00:00:00.000Z')",
    [sessionId],
  );
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits
       (session_id, commit_hash, commit_message, author, committed_at, repo_id)
     VALUES (?, ?, ?, 'a', ?, ?)`,
    [sessionId, sha, message, committedAt, repoId],
  );
};

describe('TrailDatabase commit code graphs', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    seedRepos(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips a commit code graph', () => {
    db.saveCommitCodeGraph('abc123', TEST_REPO, makeCodeGraph('n1', '2026-08-01T00:00:00.000Z'), 30);

    const loaded = db.getCommitCodeGraph('abc123', TEST_REPO);

    expect(loaded?.nodes.map((n) => n.id)).toEqual(['n1']);
    expect(loaded?.communities).toEqual({ 0: 'Community A' });
  });

  it('returns null for a sha that has no snapshot', () => {
    expect(db.getCommitCodeGraph('missing', TEST_REPO)).toBeNull();
  });

  // 同一 sha が別リポジトリにも在り得る。repo を取り違えると別のグラフが静かに出る。
  it('does not return another repository snapshot for the same sha', () => {
    db.saveCommitCodeGraph('shared', TEST_REPO, makeCodeGraph('mine', '2026-08-01T00:00:00.000Z'), 30);

    expect(db.getCommitCodeGraph('shared', OTHER_REPO)).toBeNull();
    expect(db.getCommitCodeGraph('shared', TEST_REPO)?.nodes[0]?.id).toBe('mine');
  });

  it('returns null for an unknown repository without creating it', () => {
    expect(db.getCommitCodeGraph('abc123', 'never-seen')).toBeNull();
    expect(db.listRepos().map((r) => r.repoName)).not.toContain('never-seen');
  });

  it('overwrites the snapshot when the same sha is generated again', () => {
    db.saveCommitCodeGraph('abc123', TEST_REPO, makeCodeGraph('old', '2026-08-01T00:00:00.000Z'), 30);
    db.saveCommitCodeGraph('abc123', TEST_REPO, makeCodeGraph('new', '2026-08-02T00:00:00.000Z'), 30);

    expect(db.getCommitCodeGraph('abc123', TEST_REPO)?.nodes[0]?.id).toBe('new');
  });

  describe('retention', () => {
    it('drops the oldest snapshots once the retention limit is exceeded', () => {
      db.saveCommitCodeGraph('c1', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 2);
      db.saveCommitCodeGraph('c2', TEST_REPO, makeCodeGraph('n', '2026-08-02T00:00:00.000Z'), 2);
      db.saveCommitCodeGraph('c3', TEST_REPO, makeCodeGraph('n', '2026-08-03T00:00:00.000Z'), 2);

      expect(db.getCommitCodeGraph('c1', TEST_REPO)).toBeNull();
      expect(db.getCommitCodeGraph('c2', TEST_REPO)).not.toBeNull();
      expect(db.getCommitCodeGraph('c3', TEST_REPO)).not.toBeNull();
    });

    // 回帰: 削除順を generated_at で決めていたため、同じ generatedAt を持つ 2 本が並ぶと
    // 順序が sha の辞書順へ落ち、新しく入れた方が消えることがあった。
    it('drops by write order even when the graphs report the same generatedAt', () => {
      const sameStamp = '2026-08-04T00:00:00.000Z';
      // 辞書順で「後に保存した方」が小さくなる並びを明示的に作る。
      db.saveCommitCodeGraph('zzz-old', TEST_REPO, makeCodeGraph('n', sameStamp), 1);
      db.saveCommitCodeGraph('aaa-new', TEST_REPO, makeCodeGraph('n', sameStamp), 1);

      expect(db.getCommitCodeGraph('zzz-old', TEST_REPO)).toBeNull();
      expect(db.getCommitCodeGraph('aaa-new', TEST_REPO)).not.toBeNull();
    });

    it('does not touch release snapshots', () => {
      insertRelease(db, 'v1.0.0', '2026-07-01T00:00:00.000Z');
      db.saveReleaseCodeGraph('v1.0.0', makeCodeGraph('rel', '2026-07-01T00:00:00.000Z'));

      db.saveCommitCodeGraph('c1', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 1);
      db.saveCommitCodeGraph('c2', TEST_REPO, makeCodeGraph('n', '2026-08-02T00:00:00.000Z'), 1);

      expect(db.getReleaseCodeGraph('v1.0.0', TEST_REPO)).not.toBeNull();
    });

    it('counts the limit per repository', () => {
      db.saveCommitCodeGraph('c1', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 1);
      db.saveCommitCodeGraph('c2', OTHER_REPO, makeCodeGraph('n', '2026-08-02T00:00:00.000Z'), 1);

      expect(db.getCommitCodeGraph('c1', TEST_REPO)).not.toBeNull();
      expect(db.getCommitCodeGraph('c2', OTHER_REPO)).not.toBeNull();
    });

    // 黙って消さない。何が消えたか分からないと「生成したのに無い」の原因を追えない。
    it('logs what was evicted', () => {
      const logger = (db as unknown as { logger: { info: (m: string) => void } }).logger;
      const info = jest.spyOn(logger, 'info');

      db.saveCommitCodeGraph('c1', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 1);
      db.saveCommitCodeGraph('c2', TEST_REPO, makeCodeGraph('n', '2026-08-02T00:00:00.000Z'), 1);

      const messages = info.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes('evicted 1') && m.includes('c1'))).toBe(true);
    });

    it('keeps everything when the retention limit is not positive', () => {
      db.saveCommitCodeGraph('c1', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 0);
      db.saveCommitCodeGraph('c2', TEST_REPO, makeCodeGraph('n', '2026-08-02T00:00:00.000Z'), 0);

      expect(db.getCommitCodeGraph('c1', TEST_REPO)).not.toBeNull();
      expect(db.getCommitCodeGraph('c2', TEST_REPO)).not.toBeNull();
    });
  });

  describe('listCommitCodeGraphAvailability', () => {
    beforeEach(() => {
      insertRelease(db, 'v1.0.0', '2026-07-01T00:00:00.000Z');
      insertRelease(db, 'v1.1.0', '2026-07-10T00:00:00.000Z');
      insertCommit(db, 's1', 'sha-before', '2026-06-30T00:00:00.000Z', 'before the range');
      insertCommit(db, 's1', 'sha-b', '2026-07-05T00:00:00.000Z', 'second\nbody line');
      insertCommit(db, 's1', 'sha-a', '2026-07-02T00:00:00.000Z', 'first');
      insertCommit(db, 's1', 'sha-after', '2026-07-20T00:00:00.000Z', 'after the range');
    });

    it('lists commits of the interval in committed_at order', () => {
      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0', 'v1.0.0');

      expect(ticks.map((t) => t.sha)).toEqual(['sha-a', 'sha-b']);
    });

    it('exposes the subject line only', () => {
      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0', 'v1.0.0');

      expect(ticks[1]?.subject).toBe('second');
      expect(ticks[1]?.shortSha).toBe('sha-b');
    });

    it('reports whether each commit already has a snapshot', () => {
      db.saveCommitCodeGraph('sha-a', TEST_REPO, makeCodeGraph('n', '2026-08-01T00:00:00.000Z'), 30);

      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0', 'v1.0.0');

      expect(ticks.map((t) => [t.sha, t.hasGraph])).toEqual([
        ['sha-a', true],
        ['sha-b', false],
      ]);
    });

    it('goes back to the beginning when no lower bound is given', () => {
      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0');

      expect(ticks.map((t) => t.sha)).toEqual(['sha-before', 'sha-a', 'sha-b']);
    });

    // 打ち間違いを「全件」へ広げると、数千件の目盛りとして現れる。
    it('returns nothing for an unknown upper-bound tag', () => {
      expect(db.listCommitCodeGraphAvailability(TEST_REPO, 'v9.9.9', 'v1.0.0')).toEqual([]);
    });

    it('returns nothing for an unknown repository', () => {
      expect(db.listCommitCodeGraphAvailability('never-seen', 'v1.1.0')).toEqual([]);
    });

    it('does not list commits of another repository', () => {
      insertCommit(db, 's2', 'sha-other', '2026-07-03T00:00:00.000Z', 'other repo', 2);

      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0', 'v1.0.0');

      expect(ticks.map((t) => t.sha)).not.toContain('sha-other');
    });

    it('de-duplicates a commit recorded by several sessions', () => {
      insertCommit(db, 's3', 'sha-a', '2026-07-02T00:00:00.000Z', 'first');

      const ticks = db.listCommitCodeGraphAvailability(TEST_REPO, 'v1.1.0', 'v1.0.0');

      expect(ticks.filter((t) => t.sha === 'sha-a')).toHaveLength(1);
    });
  });
});
