
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

const makeSummary = () => ({
  total: {
    lines: { total: 10, covered: 8, pct: 80 },
    statements: { total: 10, covered: 8, pct: 80 },
    functions: { total: 5, covered: 4, pct: 80 },
    branches: { total: 6, covered: 5, pct: 83.33 },
  },
  '/abs/path/to/src/foo.ts': {
    lines: { total: 10, covered: 8, pct: 80 },
    statements: { total: 10, covered: 8, pct: 80 },
    functions: { total: 5, covered: 4, pct: 80 },
    branches: { total: 6, covered: 5, pct: 83.33 },
  },
});

describe('TrailDatabase.importCurrentCoverage / getCurrentCoverage', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-coverage-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a) coverage-summary.json があるパッケージの行が挿入される', () => {
    const pkgDir = path.join(tmpDir, 'packages', 'pkg-a', 'coverage');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'coverage-summary.json'), JSON.stringify(makeSummary()));

    const count = db.importCurrentCoverage(tmpDir, 'my-repo');
    expect(count).toBeGreaterThan(0);

    const rows = db.getCurrentCoverage('my-repo');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.package === 'pkg-a')).toBe(true);
  });

  it('b) 2回目の importCurrentCoverage で洗い替えされ、古い行は残らない', () => {
    // 1回目: pkg-a に summary を配置してインポート
    const pkgADir = path.join(tmpDir, 'packages', 'pkg-a', 'coverage');
    fs.mkdirSync(pkgADir, { recursive: true });
    fs.writeFileSync(path.join(pkgADir, 'coverage-summary.json'), JSON.stringify(makeSummary()));
    db.importCurrentCoverage(tmpDir, 'my-repo');

    // pkg-a の summary を削除し、pkg-b に summary を配置
    fs.rmSync(path.join(pkgADir, 'coverage-summary.json'));
    const pkgBDir = path.join(tmpDir, 'packages', 'pkg-b', 'coverage');
    fs.mkdirSync(pkgBDir, { recursive: true });
    fs.writeFileSync(path.join(pkgBDir, 'coverage-summary.json'), JSON.stringify(makeSummary()));

    // 2回目: 洗い替えで pkg-a は消え、pkg-b のみ残るはず
    db.importCurrentCoverage(tmpDir, 'my-repo');

    const rows = db.getCurrentCoverage('my-repo');
    expect(rows.some((r) => r.package === 'pkg-a')).toBe(false);
    expect(rows.some((r) => r.package === 'pkg-b')).toBe(true);
  });

  it('c) coverage-summary.json がないパッケージは skip され、戻り値が 0', () => {
    // packages ディレクトリだけ作って summary は置かない
    const pkgDir = path.join(tmpDir, 'packages', 'pkg-no-coverage');
    fs.mkdirSync(pkgDir, { recursive: true });

    const count = db.importCurrentCoverage(tmpDir, 'my-repo');
    expect(count).toBe(0);
  });
});
