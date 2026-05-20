import type { PrReviewDetail } from '@anytime-markdown/trail-db';

import { extractPrReviewFindings } from '../extractPrReviewFindings';

const CREATED = '2026-05-20T00:00:00.000Z';

function detail(over: Partial<PrReviewDetail> = {}): PrReviewDetail {
  return {
    reviewId: 'rev1',
    repoName: 'widget',
    prNumber: 7,
    state: 'COMMENTED',
    body: '',
    comments: [],
    ...over,
  };
}

describe('extractPrReviewFindings', () => {
  it('maps each comment to a finding with null severity/category by default', () => {
    const d = detail({
      comments: [
        { path: 'a.ts', line: 12, body: 'null check needed' },
        { path: 'b.ts', line: null, body: 'rename this' },
      ],
    });
    const findings = extractPrReviewFindings(d, CREATED);
    expect(findings).toEqual([
      { findingId: 'rev1#c0', reviewId: 'rev1', filePath: 'a.ts', lineNumber: 12, severity: null, category: null, body: 'null check needed', createdAt: CREATED },
      { findingId: 'rev1#c1', reviewId: 'rev1', filePath: 'b.ts', lineNumber: null, severity: null, category: null, body: 'rename this', createdAt: CREATED },
    ]);
  });

  it('applies the optional classifier when provided', () => {
    const d = detail({ comments: [{ path: 'a.ts', line: 1, body: 'security bug' }] });
    const findings = extractPrReviewFindings(d, CREATED, () => ({ severity: 'error', category: 'security' }));
    expect(findings[0]).toMatchObject({ severity: 'error', category: 'security' });
  });

  it('creates a single body finding for CHANGES_REQUESTED with no comments', () => {
    const d = detail({ state: 'CHANGES_REQUESTED', body: 'please refactor', comments: [] });
    const findings = extractPrReviewFindings(d, CREATED);
    expect(findings).toEqual([
      { findingId: 'rev1#body', reviewId: 'rev1', filePath: '', lineNumber: null, severity: null, category: null, body: 'please refactor', createdAt: CREATED },
    ]);
  });

  it('produces no findings for COMMENTED/APPROVED with no comments', () => {
    expect(extractPrReviewFindings(detail({ state: 'COMMENTED', body: 'looks ok' }), CREATED)).toEqual([]);
    expect(extractPrReviewFindings(detail({ state: 'APPROVED', body: 'lgtm' }), CREATED)).toEqual([]);
  });

  it('produces no findings for an empty review', () => {
    expect(extractPrReviewFindings(detail({ state: 'CHANGES_REQUESTED', body: '   ' }), CREATED)).toEqual([]);
  });
});
