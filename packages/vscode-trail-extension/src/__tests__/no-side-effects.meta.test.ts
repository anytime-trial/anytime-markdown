// メタテスト: テストスイート全体がユーザー保護領域に副作用を出していないことを検証する。
// 2026-04-20 に TrailDatabase.test.ts が本番 DB を上書きした事故を受けて追加。
// このテストが失敗する場合、他のテストコードが `~/.claude/trail/*.db` 等に書き込んでいる可能性がある。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const WATCHED_FILES = [
  path.join(os.homedir(), '.claude', 'trail', 'trail.db'),
  path.join(os.homedir(), '.claude', 'trail', 'trail.db_bak'),
];

interface Snapshot {
  exists: boolean;
  mtimeMs: number;
  size: number;
}

function snapshot(p: string): Snapshot {
  try {
    const st = fs.statSync(p);
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return { exists: false, mtimeMs: 0, size: 0 };
  }
}

describe('[meta] protected persistent data paths are untouched', () => {
  const before = new Map<string, Snapshot>();

  beforeAll(() => {
    for (const p of WATCHED_FILES) {
      before.set(p, snapshot(p));
    }
  });

  afterAll(() => {
    for (const [p, beforeSnap] of before) {
      const afterSnap = snapshot(p);
      if (beforeSnap.exists && !afterSnap.exists) {
        throw new Error(`[meta] Watched file was deleted by tests: ${p}`);
      }
      if (!beforeSnap.exists && afterSnap.exists) {
        throw new Error(`[meta] Watched file was created by tests: ${p}`);
      }
      if (beforeSnap.exists && afterSnap.exists) {
        if (beforeSnap.mtimeMs !== afterSnap.mtimeMs || beforeSnap.size !== afterSnap.size) {
          throw new Error(
            `[meta] Watched file was modified by tests: ${p} ` +
              `(mtime ${beforeSnap.mtimeMs} -> ${afterSnap.mtimeMs}, size ${beforeSnap.size} -> ${afterSnap.size})`,
          );
        }
      }
    }
  });

  it('placeholder so beforeAll/afterAll run', () => {
    expect(WATCHED_FILES.length).toBeGreaterThan(0);
  });
});
