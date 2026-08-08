import { BetterSqlite3CaravanDb } from '../../../src/db/connection/BetterSqlite3CaravanDb';
import type { CaravanDbConnection } from '../../../src/db/connection/types';
import * as os from 'os';
import * as path from 'path';
import { openCaravanBookDb } from '../../../src/db/connection';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { resolveTargetRepo } from '../../../src/ingest/review/resolveTargetRepo';
import { normalizeTargetPath } from '../../../src/ingest/review/normalizeTargetPath';

type Fixture = {
  db: CaravanDbConnection;
  close: () => void;
};

/** repo_name → その repo のコミットに現れるファイルパス群。 */
async function buildFixture(repos: Record<string, string[]>): Promise<Fixture> {
  const tmpPath = path.join(os.tmpdir(), `rtr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const { db, close: closeMain } = await openCaravanBookDb(tmpPath);

  const trail = BetterSqlite3CaravanDb.openInCaravan();
  trail.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  trail.run(`CREATE TABLE activity_commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    repo_id INTEGER NOT NULL
  ) STRICT`);

  let hash = 0;
  for (const [repoName, files] of Object.entries(repos)) {
    trail.run(`INSERT INTO activity_repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z')`, [
      repoName,
    ]);
    const row = trail.exec('SELECT repo_id FROM activity_repos WHERE repo_name = ?', [repoName]);
    const repoId = Number(row[0]?.values?.[0]?.[0] ?? 0);
    for (const file of files) {
      trail.run(`INSERT INTO activity_commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`, [
        `c${hash++}`,
        file,
        repoId,
      ]);
    }
  }

  attachTrailDbFromHandle(db, trail);
  return {
    db,
    close: () => {
      trail.close();
      closeMain();
    },
  };
}

function target(raw: string) {
  const normalized = normalizeTargetPath(raw);
  if (normalized === null) throw new Error(`fixture error: ${raw} did not normalize`);
  return normalized;
}

describe('resolveTargetRepo', () => {
  let fixture: Fixture;

  afterEach(() => {
    fixture?.close();
  });

  describe('リポジトリ相対パス', () => {
    it('ワークスペースのリポジトリに実在すればそれを返す', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/foo/src/bar.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('packages/foo/src/bar.ts'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toEqual({ repo: 'anytime-markdown', path: 'packages/foo/src/bar.ts' });
    });

    // anytime-trade のレビュー 186 件が anytime-markdown 固定で照合され、
    // 永久にリンクできなかった不具合の再現ケース。
    it('ワークスペースが別リポジトリでもそのリポジトリで解決する', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/foo/src/bar.ts'],
        'anytime-trade': ['src/hooks/useHydrated.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('src/hooks/useHydrated.ts'),
          workspaceRepo: 'anytime-trade',
        }),
      ).toEqual({ repo: 'anytime-trade', path: 'src/hooks/useHydrated.ts' });
    });

    it('どのリポジトリにも実在しなければ null（推測で当てにいかない）', async () => {
      fixture = await buildFixture({ 'anytime-markdown': ['packages/foo/src/bar.ts'] });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('packages/foo/src/nonexistent.ts'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toBeNull();
    });

    it('ワークスペース外の 1 リポジトリだけに実在すればそれを返す', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/foo/src/bar.ts'],
        'anytime-markdown-docs': ['spec/31.trail/x.ja.md'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('spec/31.trail/x.ja.md'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toEqual({ repo: 'anytime-markdown-docs', path: 'spec/31.trail/x.ja.md' });
    });

    // 誤リンク防止の中核。同名ファイルが複数リポジトリに在るとき、
    // ワークスペースで決められないなら「わからない」を返す（fail-closed）。
    it('複数リポジトリに同名で実在し、ワークスペースがそのどれでもなければ null', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['src/hooks/useHydrated.ts'],
        'anytime-trade': ['src/hooks/useHydrated.ts'],
        'anytime-lab': ['other/file.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('src/hooks/useHydrated.ts'),
          workspaceRepo: 'anytime-lab',
        }),
      ).toBeNull();
    });

    it('複数リポジトリに同名で実在してもワークスペースが候補ならそれを優先する', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['src/hooks/useHydrated.ts'],
        'anytime-trade': ['src/hooks/useHydrated.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('src/hooks/useHydrated.ts'),
          workspaceRepo: 'anytime-trade',
        }),
      ).toEqual({ repo: 'anytime-trade', path: 'src/hooks/useHydrated.ts' });
    });
  });

  describe('ディレクトリ指定', () => {
    it('配下にファイルがあるリポジトリで解決する', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/markdown-viewer/src/index.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('packages/markdown-viewer'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toEqual({ repo: 'anytime-markdown', path: 'packages/markdown-viewer' });
    });

    it('前方一致が部分セグメントに及ばない', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/markdown-viewer-extra/src/index.ts'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('packages/markdown-viewer'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toBeNull();
    });
  });

  describe('絶対パス', () => {
    it('先頭セグメントがリポジトリ名なら切り出して解決する', async () => {
      fixture = await buildFixture({
        'anytime-markdown': ['packages/foo/src/bar.ts'],
        'anytime-trade': ['docs/specs/2026-07-12-data-collection-architecture.md'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('/anytime-trade/docs/specs/2026-07-12-data-collection-architecture.md'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toEqual({
        repo: 'anytime-trade',
        path: 'docs/specs/2026-07-12-data-collection-architecture.md',
      });
    });

    // 実データ: /Shared/anytime-markdown-docs/proposal/...（リポジトリ名は 2 段目）
    it('途中のセグメントがリポジトリ名でも切り出せる', async () => {
      fixture = await buildFixture({
        'anytime-markdown-docs': ['proposal/20260713-airspace.ja.md'],
      });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('/Shared/anytime-markdown-docs/proposal/20260713-airspace.ja.md'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toEqual({ repo: 'anytime-markdown-docs', path: 'proposal/20260713-airspace.ja.md' });
    });

    it('リポジトリ名が現れなければ null', async () => {
      fixture = await buildFixture({ 'anytime-markdown': ['packages/foo/src/bar.ts'] });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('/etc/passwd.txt'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toBeNull();
    });

    it('リポジトリ名は一致しても配下にファイルが実在しなければ null', async () => {
      fixture = await buildFixture({ 'anytime-trade': ['docs/specs/other.md'] });
      expect(
        resolveTargetRepo({
          db: fixture.db,
          target: target('/anytime-trade/docs/specs/missing.md'),
          workspaceRepo: 'anytime-markdown',
        }),
      ).toBeNull();
    });
  });
});
