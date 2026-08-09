import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { openCaravanBookDb } from '../../src/db/connection';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import {
  getPlanContext,
  packPlanContext,
  estimateTokens,
  type PlanContextSections,
} from '../../src/retrieve/getPlanContext';

const NOW = '2026-06-01T00:00:00.000Z';

function makeTmpPath() {
  return path.join(os.tmpdir(), `gpc-test-${process.pid}-${Date.now()}.db`);
}

describe('packPlanContext', () => {
  const sections: PlanContextSections = {
    unaddressed_findings: [
      { id: 'f1', severity: 'error', excerpt: 'a'.repeat(50), target: 'x.ts' },
      { id: 'f2', severity: 'warn', excerpt: 'b'.repeat(50), target: 'y.ts' },
    ],
    recurring_bugs: [
      { package: 'web-app', category: 'logic', count: 3, last_committed_at: NOW, example: 'c'.repeat(50) },
    ],
    decisions: [{ id: 'd1', display_name: 'decision', summary: 'd'.repeat(50) }],
    constraints: [{ subject: 's', predicate: 'must', object: 'o' }],
    cochange_partners: [{ file_path: 'z.ts', count: 5 }],
  };

  test('sufficient budget keeps everything and truncated is empty', () => {
    const result = packPlanContext(sections, 100_000);
    expect(result.unaddressed_findings).toHaveLength(2);
    expect(result.cochange_partners).toHaveLength(1);
    expect(result.truncated).toEqual({});
  });

  test('tight budget keeps high-priority sections and reports dropped counts per section', () => {
    const oneFindingCost = estimateTokens(sections.unaddressed_findings[0]);
    const result = packPlanContext(sections, oneFindingCost);
    expect(result.unaddressed_findings).toHaveLength(1);
    expect(result.truncated['unaddressed_findings']).toBe(1);
    expect(result.truncated['recurring_bugs']).toBe(1);
    expect(result.truncated['cochange_partners']).toBe(1);
  });
});

describe('getPlanContext (integration)', () => {
  async function openSeededDb() {
    const tmpPath = makeTmpPath();
    const { db, close } = await openCaravanBookDb(tmpPath);

    const insertEntity = (id: string, type: string, name: string, summary = '') => {
      db.run(
        `INSERT INTO caravan_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            summary, first_seen_at, last_updated_at, recorded_at)
         VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?, ?)`,
        [id, type, name, name, summary, NOW, NOW, NOW],
      );
    };
    // 'must' はマイグレーション seed に無く取込時に動的登録されるため、テストでは明示登録する
    db.run(
      `INSERT OR IGNORE INTO caravan_relation_types (predicate, cardinality, directionality, description)
       VALUES ('must', 'multiple_active', 'subject_to_object', 'test seed')`,
    );
    insertEntity('file1', 'File', 'packages/web-app/src/auth.ts');
    insertEntity('dec1', 'Decision', 'cookie セッションを採用', '安定性を優先した決定');
    insertEntity('rule1', 'Rule', '入力検証');
    db.run(
      `INSERT INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality)
       VALUES ('ed1', 'dec1', 'rationale_for', 'file1', ?, NULL, ?, 'conversation', 't', 0.8, 'EXTRACTED', 'asserted')`,
      [NOW, NOW],
    );
    db.run(
      `INSERT INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality)
       VALUES ('ed2', 'file1', 'must', 'rule1', ?, NULL, ?, 'spec', 't', 0.9, 'EXTRACTED', 'asserted')`,
      [NOW, NOW],
    );

    // Review + finding（未対処）
    insertEntity('rev1', 'Review', 'review');
    insertEntity('fnd1', 'ReviewFinding', 'finding');
    db.run(
      `INSERT INTO caravan_reviews
         (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
       VALUES ('r1', 'review_doc', 'test.md', 'rev1', 'code', 'test review', ?, ?)`,
      [NOW, NOW],
    );
    db.run(
      `INSERT INTO caravan_review_findings
         (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity,
          finding_text, recorded_at)
       VALUES ('rf1', 'r1', 'fnd1', 0, 'packages/web-app/src/auth.ts', 'security', 'error',
               'null セッションの検証が無い', ?)`,
      [NOW],
    );

    // 再発バグ
    insertEntity('bug1', 'Bug', 'bug1');
    db.run(
      `INSERT INTO caravan_bug_fixes
         (id, commit_sha, bug_entity_id, package, category, subject_summary,
          affected_file_paths_json, committed_at, recorded_at, workspace)
       VALUES ('bf1', 'sha1', 'bug1', 'web-app', 'logic', 'auth crash',
               '["packages/web-app/src/auth.ts"]', ?, ?, 'test-repo')`,
      [NOW, NOW],
    );

    // 共変更（attach 済み trail）
    const trailHandle = BetterSqlite3CaravanDb.openInCaravan();
    trailHandle.run(`CREATE TABLE activity_commit_files (
      id INTEGER PRIMARY KEY, commit_hash TEXT NOT NULL, repo_id INTEGER NOT NULL,
      file_path TEXT NOT NULL, change_type TEXT NOT NULL DEFAULT 'M'
    ) STRICT`);
    const files = [
      ['c1', 'packages/web-app/src/auth.ts'],
      ['c1', 'packages/web-app/src/login.ts'],
      ['c2', 'packages/web-app/src/auth.ts'],
      ['c2', 'packages/web-app/src/login.ts'],
      ['c2', 'packages/web-app/src/other.ts'],
    ];
    for (const [sha, fp] of files) {
      trailHandle.run(`INSERT INTO activity_commit_files (commit_hash, repo_id, file_path) VALUES (?, 1, ?)`, [sha, fp]);
    }
    attachTrailDbFromHandle(db, trailHandle);

    return {
      db,
      close: () => {
        trailHandle.close();
        close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      },
    };
  }

  test('collects findings, bugs, decisions, constraints and cochange for target paths', async () => {
    const { db, close } = await openSeededDb();

    const result = getPlanContext(db, { target_paths: ['packages/web-app/src/auth.ts'] });

    expect(result.unaddressed_findings).toHaveLength(1);
    expect(result.unaddressed_findings[0].severity).toBe('error');
    expect(result.recurring_bugs[0]).toMatchObject({ package: 'web-app', category: 'logic', count: 1 });
    expect(result.decisions[0].display_name).toBe('cookie セッションを採用');
    expect(result.constraints[0]).toEqual({
      subject: 'packages/web-app/src/auth.ts',
      predicate: 'must',
      object: '入力検証',
    });
    expect(result.cochange_partners[0]).toEqual({ file_path: 'packages/web-app/src/login.ts', count: 2 });
    expect(result.truncated).toEqual({});

    close();
  }, 30000);

  test('取得時の件数上限（SECTION_CAPS）で落ちた分も truncated に報告される', async () => {
    const { db, close } = await openSeededDb();

    // decisions 上限 10 に対し 11 件を接続する
    for (let i = 2; i <= 12; i++) {
      db.run(
        `INSERT INTO caravan_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            summary, first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Decision', ?, ?, '[]', '[]', '{}', '', ?, ?, ?)`,
        [`dec${i}`, `decision ${i}`, `decision ${i}`, NOW, NOW, NOW],
      );
      db.run(
        `INSERT INTO caravan_edges
           (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at,
            source_type, source_ref, confidence, confidence_label, modality)
         VALUES (?, ?, 'rationale_for', 'file1', ?, NULL, ?, 'conversation', 't', 0.8, 'EXTRACTED', 'asserted')`,
        [`ed_dec${i}`, `dec${i}`, NOW, NOW],
      );
    }

    const result = getPlanContext(db, { target_paths: ['packages/web-app/src/auth.ts'], token_budget: 100_000 });
    expect(result.decisions).toHaveLength(10);
    expect(result.truncated['decisions']).toBe(2); // 全 12 件（dec1 + dec2..12）− 上限 10

    close();
  }, 30000);

  test('empty target_paths → empty result; unrelated path → empty sections', async () => {
    const { db, close } = await openSeededDb();

    expect(getPlanContext(db, { target_paths: [] }).unaddressed_findings).toHaveLength(0);
    const unrelated = getPlanContext(db, { target_paths: ['packages/nothing/'] });
    expect(unrelated.unaddressed_findings).toHaveLength(0);
    expect(unrelated.decisions).toHaveLength(0);
    expect(unrelated.cochange_partners).toHaveLength(0);

    close();
  }, 30000);
});
