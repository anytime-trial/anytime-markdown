import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openCaravanBookDb } from '../../src/db/connection';
import type { CaravanLogger } from '../../src/logger';
import { listReviewTargetHints } from '../../src/retrieve/listReviewTargetHints';

/**
 * `listReviewTargetHints` の優先度配分を固定する。
 *
 * 実 DB では high 候補（未対処レビュー指摘 + 直近 30 日の regression fix）だけで 200 件を超え、
 * `slice(0, limit)` の前段で枠を食い潰していた。結果として medium（直近 7 日で変更された code）と
 * low（90 日レビュー未実施）は**一度も返らない**。呼び出し側からは「該当なし」と区別が付かない。
 */
describe('listReviewTargetHints の優先度配分', () => {
  let tmpDir: string;
  let handle: Awaited<ReturnType<typeof openCaravanBookDb>>;
  let errors: string[];
  let logger: CaravanLogger;

  const now = new Date();
  const iso = (daysAgo: number): string =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memcore-hints-'));
    handle = await openCaravanBookDb(path.join(tmpDir, 'caravan-book.db'));
    errors = [];
    logger = {
      info: () => {},
      warn: () => {},
      error: (msg: string) => { errors.push(msg); },
    } as unknown as CaravanLogger;

    handle.db.run(
      `INSERT INTO caravan_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES ('ent-bug', 'File', 'bug/anchor.ts', 'anchor.ts', ?, ?, ?)`,
      [iso(0), iso(0), iso(0)],
    );
  });

  afterEach(() => {
    handle.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertRegressionFixes(count: number, category = 'regression'): void {
    for (let i = 0; i < count; i++) {
      handle.db.run(
        `INSERT INTO caravan_bug_fixes
           (id, commit_sha, bug_entity_id, package, category, subject_summary,
            affected_file_paths_json, committed_at, recorded_at)
         VALUES (?, ?, 'ent-bug', 'pkg', ?, 'fix', ?, ?, ?)`,
        [`bf-${i}`, `sha-${i}`, category, JSON.stringify([`src/hot${i}.ts`]), iso(1), iso(1)],
      );
    }
  }

  function insertCodeFacts(count: number, daysAgo: number, prefix: string): void {
    for (let i = 0; i < count; i++) {
      handle.db.run(
        `INSERT INTO caravan_code_facts
           (id, repo_name, file_path, fact_type, fact_value, recorded_at)
         VALUES (?, 'repo', ?, 'imports', 'x', ?)`,
        [`cf-${prefix}-${i}`, `src/${prefix}${i}.ts`, iso(daysAgo)],
      );
    }
  }

  it('high が limit を超えても medium / low が枠を得る', () => {
    insertRegressionFixes(30);
    insertCodeFacts(5, 2, 'recent');   // medium: 直近 7 日
    insertCodeFacts(5, 60, 'stale');   // low: 7 日より古く、レビュー無し

    const result = listReviewTargetHints({ db: handle.db, limit: 20, logger });

    expect(errors).toEqual([]);
    expect(result).toHaveLength(20);
    const byPriority = (p: string) => result.filter((r) => r.priority === p);
    // limit 20 の枠は high 10 / medium 7 / low 3。medium は候補 5 件すべて、low は枠の 3 件が入る。
    // 使われなかった枠（medium の 2 件分）は優先度順に再配分されるため high は 10 を超える。
    expect(byPriority('medium')).toHaveLength(5);
    expect(byPriority('low').length).toBeGreaterThanOrEqual(3);
    expect(byPriority('high').length).toBeGreaterThanOrEqual(10);
    expect(byPriority('high').length).toBeLessThan(30);
  });

  it('出力は high → medium → low の順に並ぶ', () => {
    insertRegressionFixes(30);
    insertCodeFacts(5, 2, 'recent');
    insertCodeFacts(5, 60, 'stale');

    const result = listReviewTargetHints({ db: handle.db, limit: 20, logger });

    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = result.map((r) => rank[r.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('medium / low が無ければ余った枠は high が埋める', () => {
    insertRegressionFixes(30);

    const result = listReviewTargetHints({ db: handle.db, limit: 20, logger });

    expect(result).toHaveLength(20);
    expect(result.every((r) => r.priority === 'high')).toBe(true);
  });

  it('候補が limit に満たなければその件数だけ返す', () => {
    insertRegressionFixes(3);

    const result = listReviewTargetHints({ db: handle.db, limit: 20, logger });

    expect(result).toHaveLength(3);
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
  ])('limit=%i では %i 件返る（枠が 0 でも再配分で埋まる）', (limit, expected) => {
    insertRegressionFixes(30);
    insertCodeFacts(5, 2, 'recent');

    const result = listReviewTargetHints({ db: handle.db, limit, logger });

    expect(result).toHaveLength(expected);
  });

  it('負値・非整数の limit で件数が増えない', () => {
    insertRegressionFixes(30);

    // 負値を素通しすると枠が負になって配分が破綻する（変更前は slice(0, -1) が
    // 「末尾 1 件を落とした全件」＝ 29 件を返していた）。
    expect(listReviewTargetHints({ db: handle.db, limit: -1, logger })).toHaveLength(0);
    expect(listReviewTargetHints({ db: handle.db, limit: 2.7, logger })).toHaveLength(2);
  });

  it('regression 以外の bug fix は high に入らない（§6.5.2 準拠）', () => {
    insertRegressionFixes(5, 'logic');
    insertCodeFacts(2, 2, 'recent');

    const result = listReviewTargetHints({ db: handle.db, limit: 20, logger });

    expect(errors).toEqual([]);
    expect(result.filter((r) => r.priority === 'high')).toEqual([]);
    expect(result.some((r) => r.target_ref === 'src/hot0.ts')).toBe(false);
  });
});
