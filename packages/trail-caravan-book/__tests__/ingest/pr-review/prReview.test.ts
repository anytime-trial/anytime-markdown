/**
 * Tests for src/ingest/pr-review/ingestPrReview.ts
 *
 * GitHub PR レビューを caravan_reviews / caravan_review_findings へ取り込む
 * ingestPrReview の新規取込・冪等 skip・洗い替え・source_ref 一意性を検証する。
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { ingestPrReview, type PrReviewIngestInput } from '../../../src/ingest/pr-review/ingestPrReview';
import type { MemoryDbConnection } from '../../../src/db/connection/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openFresh(): Promise<{ db: MemoryDbConnection; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `pr-review-ingest-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const { db, close } = await openMemoryCoreDb(tmpPath);
  return {
    db,
    close: () => {
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

function makeInput(overrides: Partial<PrReviewIngestInput> = {}): PrReviewIngestInput {
  return {
    repoName: 'anytime-markdown',
    prNumber: 42,
    reviewId: 'rev-1',
    author: 'octocat',
    state: 'CHANGES_REQUESTED',
    submittedAt: '2026-05-01T00:00:00Z',
    bodyHash: 'hash-a',
    findings: [
      {
        findingIndex: 0,
        targetFilePath: 'src/foo.ts',
        targetLineStart: 10,
        targetLineEnd: 20,
        category: 'logic',
        severity: 'warn',
        findingText: 'Some logic issue',
        suggestionText: 'Fix it like this',
      },
      {
        findingIndex: 1,
        targetFilePath: 'src/bar.ts',
        category: 'security',
        severity: 'error',
        findingText: 'Possible XSS',
        suggestionText: 'Sanitize input',
      },
    ],
    ...overrides,
  };
}

function selectReviewRow(db: MemoryDbConnection, reviewRowId: string) {
  const rows = db.exec(
    `SELECT source_kind, source_ref, source_hash, severity_overall, target_refs_json, title, reviewer, workspace
       FROM caravan_reviews WHERE id=?`,
    [reviewRowId],
  );
  const values = rows[0]?.values?.[0];
  if (!values) return null;
  const [sourceKind, sourceRef, sourceHash, severityOverall, targetRefsJson, title, reviewer, workspace] = values;
  return {
    sourceKind: String(sourceKind),
    sourceRef: String(sourceRef),
    sourceHash: String(sourceHash),
    severityOverall: String(severityOverall),
    targetRefsJson: String(targetRefsJson),
    title: String(title),
    reviewer: String(reviewer),
    workspace: String(workspace),
  };
}

function selectFindings(db: MemoryDbConnection, reviewRowId: string) {
  const rows = db.exec(
    `SELECT finding_index, finding_text, severity, target_file_path
       FROM caravan_review_findings WHERE review_id=? ORDER BY finding_index`,
    [reviewRowId],
  );
  const values = rows[0]?.values ?? [];
  return values.map(([findingIndex, findingText, severity, targetFilePath]) => ({
    findingIndex: Number(findingIndex),
    findingText: String(findingText),
    severity: String(severity),
    targetFilePath: targetFilePath == null ? null : String(targetFilePath),
  }));
}

function countFlaggedEdges(db: MemoryDbConnection, reviewRowId: string): number {
  const rows = db.exec(
    `SELECT COUNT(*) FROM caravan_edges WHERE predicate='flagged' AND subject_entity_id=?`,
    [reviewRowId],
  );
  return Number(rows[0]?.values?.[0]?.[0] ?? 0);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ingestPrReview', () => {
  it('新規取込: findings 2 件を保存し severity_overall は最大重大度になる', async () => {
    const { db, close } = await openFresh();
    try {
      const result = ingestPrReview(db, makeInput());

      expect(result.created).toBe(true);
      expect(result.findingsCount).toBe(2);

      const row = selectReviewRow(db, result.reviewRowId);
      expect(row).not.toBeNull();
      expect(row?.sourceKind).toBe('pr_comment');
      expect(row?.sourceRef).toBe('anytime-markdown#pr42#rev-1');
      expect(row?.sourceHash).toBe('hash-a');
      // 2 findings: warn / error → 最大は error
      expect(row?.severityOverall).toBe('error');
      expect(row?.reviewer).toBe('octocat');
      expect(JSON.parse(row?.targetRefsJson ?? '[]')).toEqual(['src/foo.ts', 'src/bar.ts']);

      const findings = selectFindings(db, result.reviewRowId);
      expect(findings).toHaveLength(2);
      expect(findings[0].findingText).toBe('Some logic issue');
      expect(findings[1].severity).toBe('error');

      expect(countFlaggedEdges(db, result.reviewRowId)).toBe(2);
    } finally {
      close();
    }
  });

  it('同一 bodyHash 再送: created=false で行数が変わらない', async () => {
    const { db, close } = await openFresh();
    try {
      const first = ingestPrReview(db, makeInput());
      expect(first.created).toBe(true);
      expect(selectFindings(db, first.reviewRowId)).toHaveLength(2);

      const second = ingestPrReview(db, makeInput());
      expect(second.created).toBe(false);
      expect(second.reviewRowId).toBe(first.reviewRowId);
      expect(second.findingsCount).toBe(2);

      // 行数不変 (findings が重複挿入されていない)
      expect(selectFindings(db, first.reviewRowId)).toHaveLength(2);
    } finally {
      close();
    }
  });

  it('bodyHash 変更: findings が洗い替えられる（旧 finding が消え新 finding が入る）', async () => {
    const { db, close } = await openFresh();
    try {
      const first = ingestPrReview(db, makeInput());
      expect(selectFindings(db, first.reviewRowId).map((f) => f.findingText)).toEqual([
        'Some logic issue',
        'Possible XSS',
      ]);
      expect(countFlaggedEdges(db, first.reviewRowId)).toBe(2);

      const updated = ingestPrReview(
        db,
        makeInput({
          bodyHash: 'hash-b',
          findings: [
            {
              findingIndex: 0,
              targetFilePath: 'src/baz.ts',
              category: 'naming',
              severity: 'info',
              findingText: 'Rename this variable',
              suggestionText: 'Use camelCase',
            },
          ],
        }),
      );

      expect(updated.reviewRowId).toBe(first.reviewRowId);
      expect(updated.created).toBe(false);
      expect(updated.findingsCount).toBe(1);

      const findings = selectFindings(db, first.reviewRowId);
      expect(findings).toHaveLength(1);
      expect(findings[0].findingText).toBe('Rename this variable');

      const row = selectReviewRow(db, first.reviewRowId);
      expect(row?.sourceHash).toBe('hash-b');
      expect(row?.severityOverall).toBe('info');

      // 旧 finding への flagged edge も一緒に外れている（新 finding 分の 1 件のみ残る）
      expect(countFlaggedEdges(db, first.reviewRowId)).toBe(1);
    } finally {
      close();
    }
  });

  it('source_ref の一意性: 別 reviewId は別行として保存される', async () => {
    const { db, close } = await openFresh();
    try {
      const first = ingestPrReview(db, makeInput({ reviewId: 'rev-1' }));
      const secondInput = makeInput({ reviewId: 'rev-2', bodyHash: 'hash-c' });
      const second = ingestPrReview(db, secondInput);

      expect(second.reviewRowId).not.toBe(first.reviewRowId);
      expect(second.created).toBe(true);

      const rows = db.exec(`SELECT COUNT(*) FROM caravan_reviews WHERE source_kind='pr_comment'`);
      expect(Number(rows[0]?.values?.[0]?.[0] ?? 0)).toBe(2);
    } finally {
      close();
    }
  });
});
