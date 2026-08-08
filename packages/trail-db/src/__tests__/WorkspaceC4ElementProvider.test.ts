import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkspaceC4ElementProvider } from '../WorkspaceC4ElementProvider';

function writePackage(root: string, name: string): void {
  const dir = path.join(root, 'packages', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `@anytime-markdown/${name}` }),
  );
}

function createManualElementsDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE activity_repos(repo_id INTEGER, repo_name TEXT);
    CREATE TABLE activity_c4_manual_elements(
      repo_id INTEGER,
      element_id TEXT,
      type TEXT,
      name TEXT,
      description TEXT,
      external INTEGER,
      parent_id TEXT,
      service_type TEXT,
      updated_at TEXT
    );
  `);
  db.prepare('INSERT INTO activity_repos(repo_id, repo_name) VALUES (?, ?)').run(1, 'anytime-markdown');
  return db;
}

describe('WorkspaceC4ElementProvider', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-c4-provider-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('derives one container element per workspace package plus the system root', () => {
    writePackage(root, 'trail-activity');
    writePackage(root, 'trail-db');

    const elements = new WorkspaceC4ElementProvider({
      workspaceRoot: root,
      repoName: 'anytime-markdown',
    }).listElements();

    expect(elements).toEqual([
      { id: 'sys_anytime-markdown', type: 'system', name: 'anytime-markdown' },
      {
        id: 'pkg_trail-activity',
        type: 'container',
        name: 'trail-activity',
        boundaryId: 'sys_anytime-markdown',
      },
      {
        id: 'pkg_trail-db',
        type: 'container',
        name: 'trail-db',
        boundaryId: 'sys_anytime-markdown',
      },
    ]);
  });

  it('ignores directories under packages/ that have no package.json', () => {
    writePackage(root, 'trail-activity');
    fs.mkdirSync(path.join(root, 'packages', 'scratch'), { recursive: true });

    const ids = new WorkspaceC4ElementProvider({ workspaceRoot: root, repoName: 'repo' })
      .listElements()
      .map((element) => element.id);

    expect(ids).toEqual(['sys_repo', 'pkg_trail-activity']);
  });

  it('returns only the system element when the packages directory is missing', () => {
    const ids = new WorkspaceC4ElementProvider({ workspaceRoot: root, repoName: 'repo' })
      .listElements()
      .map((element) => element.id);

    expect(ids).toEqual(['sys_repo']);
  });

  it('lets manual C4 elements override derived ones and adds manual-only elements', () => {
    writePackage(root, 'trail-activity');
    const db = createManualElementsDb();
    db.prepare(`
      INSERT INTO activity_c4_manual_elements(repo_id, element_id, type, name, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 'pkg_trail-activity', 'component', 'Trail Core (manual)', 'sys_anytime-markdown');
    db.prepare(`
      INSERT INTO activity_c4_manual_elements(repo_id, element_id, type, name, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 'ext_supabase', 'system', 'Supabase', null);

    const elements = new WorkspaceC4ElementProvider({
      workspaceRoot: root,
      repoName: 'anytime-markdown',
      db,
    }).listElements();
    db.close();

    expect(elements).toContainEqual({
      id: 'pkg_trail-activity',
      type: 'component',
      name: 'Trail Core (manual)',
      boundaryId: 'sys_anytime-markdown',
    });
    expect(elements).toContainEqual({ id: 'ext_supabase', type: 'system', name: 'Supabase' });
    expect(elements.filter((element) => element.id === 'pkg_trail-activity')).toHaveLength(1);
  });

  it('falls back to derived elements when the repository is absent from the repos table', () => {
    writePackage(root, 'trail-activity');
    const db = createManualElementsDb();

    const ids = new WorkspaceC4ElementProvider({
      workspaceRoot: root,
      repoName: 'unknown-repo',
      db,
    })
      .listElements()
      .map((element) => element.id);
    db.close();

    expect(ids).toEqual(['sys_unknown-repo', 'pkg_trail-activity']);
  });
});
