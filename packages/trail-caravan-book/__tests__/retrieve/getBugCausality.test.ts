import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { openCaravanBookDb } from '../../src/db/connection';
import { getBugCausality } from '../../src/retrieve/getBugCausality';

function makeTmpPath() {
  return path.join(os.tmpdir(), `gbc-test-${process.pid}-${Date.now()}.db`);
}

const NOW = '2026-06-01T00:00:00.000Z';

async function openSeededDb() {
  const tmpPath = makeTmpPath();
  const { db, close } = await openCaravanBookDb(tmpPath);

  const insertEntity = (id: string, type: string, name: string) => {
    db.run(
      `INSERT INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [id, type, name, name, NOW, NOW, NOW],
    );
  };
  const insertEdge = (id: string, subj: string, pred: string, obj: string) => {
    db.run(
      `INSERT INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality)
       VALUES (?, ?, ?, ?, ?, NULL, ?, 'review', 'test', 0.7, 'INFERRED', 'asserted')`,
      [id, subj, pred, obj, NOW, NOW],
    );
  };

  insertEntity('bug1', 'Bug', 'ログインが 500 で落ちる');
  insertEntity('bug2', 'Bug', '別件のバグ');
  insertEntity('finding1', 'ReviewFinding', 'auth.ts の null チェック漏れを指摘');
  insertEntity('dec1', 'Decision', 'セッション管理は cookie 方式を採用');
  insertEdge('e1', 'finding1', 'precedes', 'bug1');
  insertEdge('e2', 'bug1', 'relates_to', 'dec1');

  db.run(
    `INSERT INTO caravan_episodes
       (id, session_id, message_uuid_start, message_uuid_end,
        agent_runtime, model, valid_from, recorded_at, raw_excerpt)
     VALUES ('ep1', 'sess1', 'm1', 'm2', 'claude_code', 'test', ?, ?, '原因は auth.ts の null 参照だと特定した長い議論の記録')`,
    [NOW, NOW],
  );

  const insertBugFix = (
    id: string, sha: string, bugId: string, pkg: string, cat: string, subject: string,
    body: string, introduced: string | null, episode: string | null, files: string, at: string,
  ) => {
    db.run(
      `INSERT INTO caravan_bug_fixes
         (id, commit_sha, bug_entity_id, package, category, subject_summary,
          body_excerpt, affected_file_paths_json, introduced_commit_sha, root_cause_episode_id,
          committed_at, recorded_at, workspace)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test-repo')`,
      [id, sha, bugId, pkg, cat, subject, body, files, introduced, episode, at, NOW],
    );
  };
  insertBugFix(
    'bf1', 'abc1234def', 'bug1', 'web-app', 'logic', 'login crashes with 500',
    '原因: auth.ts が null セッションを参照。採った方針: 早期リターン追加。',
    'intro789abc', 'ep1', '["packages/web-app/src/auth.ts"]', '2026-05-30T00:00:00.000Z',
  );
  insertBugFix(
    'bf2', 'ddd5678eee', 'bug2', 'web-app', 'logic', 'another bug in auth flow',
    '', null, null, '["packages/web-app/src/auth.ts"]', '2026-05-20T00:00:00.000Z',
  );

  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

describe('getBugCausality', () => {
  test('commit_sha prefix resolves a full card with all causal fields', async () => {
    const { db, close } = await openSeededDb();

    const result = getBugCausality(db, { commit_sha: 'abc1234' });

    expect(result.matched).toBe(true);
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0];
    expect(card.bug.display_name).toBe('ログインが 500 で落ちる');
    expect(card.fix_commit.why).toContain('早期リターン追加');
    expect(card.introduced_commit).toEqual({ sha: 'intro789abc', inferred: true });
    expect(card.root_cause_episode?.id).toBe('ep1');
    expect(card.precursor_findings).toHaveLength(1);
    expect(card.precursor_findings[0].excerpt).toContain('null チェック漏れ');
    expect(card.related_decisions).toHaveLength(1);
    expect(card.recurrence.same_category_count).toBe(1); // bf2 が同 package/category
    expect(card.recurrence.same_file_bug_count).toBe(1); // bf2 が同一ファイル

    close();
  }, 30000);

  test('file_path and query resolve cards; empty causal fields are explicit nulls', async () => {
    const { db, close } = await openSeededDb();

    const byFile = getBugCausality(db, { file_path: 'packages/web-app/src/auth.ts' });
    expect(byFile.cards).toHaveLength(2); // committed_at DESC
    expect(byFile.cards[0].fix_commit.sha).toBe('abc1234def');

    const byQuery = getBugCausality(db, { query: 'another auth' });
    expect(byQuery.cards).toHaveLength(1);
    const card = byQuery.cards[0];
    expect(card.fix_commit.why).toBeNull();
    expect(card.introduced_commit).toBeNull();
    expect(card.root_cause_episode).toBeNull();

    close();
  }, 30000);

  test('file_path は完全一致 or dir prefix のみ（auth.ts が auth.tsx に誤ヒットしない）', async () => {
    const { db, close } = await openSeededDb();

    // auth.tsx だけを触った別のバグ修正を足す
    db.run(
      `INSERT INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES ('bug3', 'Bug', 'bug3', 'tsx 側のバグ', '[]', '[]', '{}', ?, ?, ?)`,
      [NOW, NOW, NOW],
    );
    db.run(
      `INSERT INTO caravan_bug_fixes
         (id, commit_sha, bug_entity_id, package, category, subject_summary,
          body_excerpt, affected_file_paths_json, committed_at, recorded_at, workspace)
       VALUES ('bf3', 'fff9999aaa', 'bug3', 'web-app', 'logic', 'tsx bug', '',
               '["packages/web-app/src/auth.tsx"]', ?, ?, 'test-repo')`,
      [NOW, NOW],
    );

    const byFile = getBugCausality(db, { file_path: 'packages/web-app/src/auth.ts' });
    expect(byFile.cards.map((c) => c.fix_commit.sha)).not.toContain('fff9999aaa');
    expect(byFile.cards).toHaveLength(2);

    // dir prefix は一致する
    const byDir = getBugCausality(db, { file_path: 'packages/web-app/src', limit: 5 });
    expect(byDir.cards).toHaveLength(3);

    close();
  }, 30000);

  test('no filter or no hit → matched=false with empty cards', async () => {
    const { db, close } = await openSeededDb();

    expect(getBugCausality(db, {})).toEqual({ cards: [], matched: false });
    expect(getBugCausality(db, { query: '存在しない症状キーワード' }).matched).toBe(false);

    close();
  }, 30000);
});
