import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

const RECORDED_AT = '2026-05-31T00:00:00.000Z';

describe('TrailDatabase decision comments', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('saveDecisionComments → getDecisionComments の round-trip', () => {
    db.saveDecisionComments(
      'repo1',
      [
        { filePath: 'src/a.ts', line: 3, text: 'reason a', symbolName: 'fnA' },
        { filePath: 'src/b.ts', line: 9, text: 'reason b', symbolName: null },
      ],
      { commitSha: 'abc123', recordedAt: RECORDED_AT },
    );

    const rows = db.getDecisionComments('repo1');
    expect(rows).toHaveLength(2);
    const byFile = new Map(rows.map((r) => [r.file_path, r]));
    expect(byFile.get('src/a.ts')?.comment_text).toBe('reason a');
    expect(byFile.get('src/a.ts')?.symbol_name).toBe('fnA');
    expect(byFile.get('src/a.ts')?.commit_sha).toBe('abc123');
    expect(byFile.get('src/b.ts')?.symbol_name).toBeNull();
  });

  it('repo 単位で洗い替え（wash-away）する', () => {
    db.saveDecisionComments(
      'repo1',
      [
        { filePath: 'src/a.ts', line: 1, text: 'old 1', symbolName: null },
        { filePath: 'src/a.ts', line: 2, text: 'old 2', symbolName: null },
      ],
      { recordedAt: RECORDED_AT },
    );
    expect(db.getDecisionComments('repo1')).toHaveLength(2);

    // 再保存で全置換
    db.saveDecisionComments(
      'repo1',
      [{ filePath: 'src/a.ts', line: 5, text: 'new only', symbolName: null }],
      { recordedAt: RECORDED_AT },
    );
    const rows = db.getDecisionComments('repo1');
    expect(rows).toHaveLength(1);
    expect(rows[0].comment_text).toBe('new only');
  });

  it('別 repo の comment は混在しない', () => {
    db.saveDecisionComments('repo1', [{ filePath: 'a.ts', line: 1, text: 'r1', symbolName: null }], {
      recordedAt: RECORDED_AT,
    });
    db.saveDecisionComments('repo2', [{ filePath: 'b.ts', line: 1, text: 'r2', symbolName: null }], {
      recordedAt: RECORDED_AT,
    });
    expect(db.getDecisionComments('repo1')).toHaveLength(1);
    expect(db.getDecisionComments('repo2')).toHaveLength(1);
    expect(db.getDecisionComments('repo1')[0].comment_text).toBe('r1');
  });

  it('未登録 repo は空配列を返す', () => {
    expect(db.getDecisionComments('nope')).toEqual([]);
  });
});
