import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryLogger } from '../../src/logger';
import { detectDrift } from '../../src/retrieve/detectDrift';
import { explainDrift } from '../../src/retrieve/explainDrift';
import { getBugHistory } from '../../src/retrieve/getBugHistory';
import { getReviewHistory } from '../../src/retrieve/getReviewHistory';
import { listRecurringBugs } from '../../src/retrieve/listRecurringBugs';
import { listReviewTargetHints } from '../../src/retrieve/listReviewTargetHints';
import { listUnaddressedReviewFindings } from '../../src/retrieve/listUnaddressedReviewFindings';

/**
 * retrieve のクエリが**実スキーマ（migrations）と一致している**ことを固定する。
 *
 * これらの関数は個々のクエリ失敗を握って fail-open で継続する（呼び出し側には
 * 「該当なし」と同じ空配列が返る）。そのため列名がスキーマとずれても本番で失敗として
 * 現れず、ログを読むまで気付けない。実例: `memory_code_facts` は `recorded_at` を持つのに
 * `last_seen_at` を参照していて、「直近 7 日で変更されたファイル」ヒントが常に欠落していた。
 * `explainDrift` の code ソースも `entity_id` / `fact_kind` / `last_seen_at` の 3 つが実在せず、
 * 5 ソースのうち 1 つが常に空だった。
 *
 * ここでは migrations を適用した空 DB に対して各関数を実行し、**logger.error が 1 件も
 * 出ないこと**を検査する。空 DB なので結果は空でよく、見ているのは SQL がスキーマに
 * 通るかどうか。
 */
describe('retrieve クエリとスキーマの整合', () => {
  let tmpDir: string;
  let handle: Awaited<ReturnType<typeof openMemoryCoreDb>>;
  let errors: string[];
  let logger: MemoryLogger;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memcore-schema-'));
    handle = await openMemoryCoreDb(path.join(tmpDir, 'memory-core.db'));
  });

  afterAll(() => {
    handle.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    errors = [];
    logger = {
      info: () => {},
      warn: () => {},
      error: (msg: string) => { errors.push(msg); },
    } as unknown as MemoryLogger;
  });

  it('listReviewTargetHints の全クエリがスキーマに通る', () => {
    listReviewTargetHints({ db: handle.db, logger });
    expect(errors).toEqual([]);
  });

  it('explainDrift の全ソース取得がスキーマに通る（イベントを 1 件入れて全 gather を通す）', () => {
    // イベントが無いと早期 return して gather* に到達しない（＝素通りするテストになる）。
    const now = '2026-08-02T00:00:00.000Z';
    handle.db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, ?, ?, ?)`,
      ['ent-file-1', 'packages/foo/src/bar.ts', 'bar.ts', now, now, now],
    );
    handle.db.run(
      `INSERT INTO memory_drift_events
         (id, subject_entity_id, predicate, drift_type, severity, detected_at, detail_json)
       VALUES (?, ?, 'depends_on', 'spec_vs_code', 'warn', ?, '{}')`,
      ['drift:test:1', 'ent-file-1', now],
    );

    const result = explainDrift({ db: handle.db, event_id: 'drift:test:1', logger });

    expect(errors).toEqual([]);
    expect(result).not.toBeNull();
  });

  it('explainDrift の code ソースが大文字を含むパスでも拾える', () => {
    // canonical_name は canonicalize() で小文字化される一方、code_facts の file_path は
    // 原文のまま。素の等値結合にすると大文字を含むパス（実 DB の 76%）が落ちる。
    const now = '2026-08-02T00:00:00.000Z';
    handle.db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, ?, ?, ?)`,
      ['ent-file-2', 'packages/foo/src/mixedcase.ts', 'MixedCase.ts', now, now, now],
    );
    handle.db.run(
      `INSERT INTO memory_drift_events
         (id, subject_entity_id, predicate, drift_type, severity, detected_at, detail_json)
       VALUES (?, ?, 'depends_on', 'spec_vs_code', 'warn', ?, '{}')`,
      ['drift:test:2', 'ent-file-2', now],
    );
    handle.db.run(
      `INSERT INTO memory_code_facts
         (id, repo_name, file_path, fact_type, fact_value, recorded_at)
       VALUES (?, 'anytime-markdown', ?, 'imports', 'react', ?)`,
      ['fact-1', 'packages/foo/src/MixedCase.ts', now],
    );

    const result = explainDrift({ db: handle.db, event_id: 'drift:test:2', logger });

    expect(errors).toEqual([]);
    const code = result?.sources.find((s) => s.source === 'code');
    expect(code?.items).toHaveLength(1);
    expect(code?.items[0]).toMatchObject({
      file_path: 'packages/foo/src/MixedCase.ts',
      fact_type: 'imports',
    });
  });

  it('detectDrift / getBugHistory / listRecurringBugs がスキーマに通る', () => {
    detectDrift({ db: handle.db, logger });
    listRecurringBugs({ db: handle.db, logger });
    getBugHistory({ db: handle.db, logger });
    expect(errors).toEqual([]);
  });

  it('レビュー系の取得がスキーマに通る', () => {
    getReviewHistory({ db: handle.db, logger });
    listUnaddressedReviewFindings({ db: handle.db, logger });
    expect(errors).toEqual([]);
  });
});
