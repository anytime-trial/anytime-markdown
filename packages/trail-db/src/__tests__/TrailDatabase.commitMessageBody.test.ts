import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

/**
 * `session_commits.commit_message` はフルメッセージ（件名＋本文）を保持する。
 *
 * 件名だけを格納していると、コミット本文から決定根拠を取り出す
 * `extractCommitRationale` が全件 skip し、Rationale Audit の監査対象が
 * 恒久的に 0 件になる（2026-08-05 実測: 6,193 件すべて改行なし）。消費側が
 * 一様に `commit_message.split('\n')[0]` で件名を取り出していることからも、
 * この列がフルメッセージを持つ前提であることが読み取れる。
 */

type SqlJsDb = {
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const insertSession = (db: TrailDatabase, sessionId: string, startTime: string, endTime: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', ?, ?, 0, '', 0, '')`,
    [sessionId, sessionId, startTime, endTime],
  );
};

const initGitRepo = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
  const opts = { cwd: dir, encoding: 'utf-8' as const };
  execFileSync('git', ['init', '-q', '-b', 'main'], opts);
  execFileSync('git', ['config', 'user.email', 'test@example.com'], opts);
  execFileSync('git', ['config', 'user.name', 'Test'], opts);
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], opts);
};

const commit = (dir: string, fileName: string, message: string, date: string): string => {
  fs.writeFileSync(path.join(dir, fileName), `content of ${fileName}`);
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const opts = { cwd: dir, encoding: 'utf-8' as const, env };
  execFileSync('git', ['add', fileName], opts);
  execFileSync('git', ['commit', '-q', '-m', message], opts);
  return execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
};

const getCommitMessage = (db: TrailDatabase, sessionId: string, hash: string): string => {
  const r = inner(db).exec(
    `SELECT commit_message FROM session_commits WHERE session_id = ? AND commit_hash = ?`,
    [sessionId, hash],
  );
  return String(r[0]?.values[0]?.[0] ?? '');
};

const resolve = (db: TrailDatabase, sessionId: string, dir: string, repo: string): number =>
  (db as unknown as {
    resolveCommits: (sid: string, gitRoot: string, repoName: string) => number;
  }).resolveCommits(sessionId, dir, repo);

describe('session_commits.commit_message はフルメッセージを保持する', () => {
  let db: TrailDatabase;
  let tmpRoot: string;
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const startTime = '2026-04-29T00:00:00.000Z';
  const endTime = '2026-04-29T01:00:00.000Z';
  const commitDate = '2026-04-29T00:30:00+00:00';

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-commit-body-'));
    insertSession(db, sessionId, startTime, endTime);
  });

  afterEach(() => {
    db.close();
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('本文を持つコミットで件名と本文の両方が入る', () => {
    const repoDir = path.join(tmpRoot, 'repo-body');
    initGitRepo(repoDir);
    const message = [
      'fix(trail-db/logic): 本文を保存する',
      '',
      '件名だけを保存していたため決定根拠の抽出が全件 skip していた。',
      '消費側は split で件名を取り出すのでフルメッセージで問題ない。',
      '',
      `Session-Id: ${sessionId}`,
    ].join('\n');
    const hash = commit(repoDir, 'a.txt', message, commitDate);

    expect(resolve(db, sessionId, repoDir, 'repo-body')).toBeGreaterThan(0);

    const stored = getCommitMessage(db, sessionId, hash);
    expect(stored).toContain('件名だけを保存していたため決定根拠の抽出が全件 skip していた。');
    expect(stored).toContain('消費側は split で件名を取り出すのでフルメッセージで問題ない。');
    // 件名は先頭行に残る（消費側は split('\n')[0] で件名を取り出す）
    expect(stored.split('\n')[0]).toBe('fix(trail-db/logic): 本文を保存する');
    // 件名と本文の間は空行で区切る（git のメッセージ規約と同じ形に戻す）
    expect(stored.split('\n')[1]).toBe('');
  });

  it('件名のみのコミットでは余分な改行を付けない', () => {
    const repoDir = path.join(tmpRoot, 'repo-subject-only');
    initGitRepo(repoDir);
    const hash = commit(repoDir, 'b.txt', 'chore: 件名のみ', commitDate);

    expect(resolve(db, sessionId, repoDir, 'repo-subject-only')).toBeGreaterThan(0);

    const stored = getCommitMessage(db, sessionId, hash);
    expect(stored).toBe('chore: 件名のみ');
    expect(stored).not.toContain('\n');
  });
});
