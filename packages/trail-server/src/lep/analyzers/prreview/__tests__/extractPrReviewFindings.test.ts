import { extractPrReviewFindingInputs, type PrReviewFindingSource } from '../extractPrReviewFindings';

function source(over: Partial<PrReviewFindingSource> = {}): PrReviewFindingSource {
  return {
    state: 'COMMENTED',
    body: '',
    comments: [],
    ...over,
  };
}

describe('extractPrReviewFindingInputs', () => {
  it('maps each comment to a finding input with null severity/category by default', () => {
    const s = source({
      comments: [
        { path: 'a.ts', line: 12, body: 'null check needed' },
        { path: 'b.ts', line: null, body: 'rename this' },
      ],
    });
    const findings = extractPrReviewFindingInputs(s);
    expect(findings).toEqual([
      {
        findingIndex: 0,
        targetFilePath: 'a.ts',
        targetLineStart: 12,
        targetLineEnd: 12,
        category: null,
        severity: null,
        findingText: 'null check needed',
        suggestionText: '',
      },
      {
        findingIndex: 1,
        targetFilePath: 'b.ts',
        targetLineStart: null,
        targetLineEnd: null,
        category: null,
        severity: null,
        findingText: 'rename this',
        suggestionText: '',
      },
    ]);
  });

  it('applies the optional classifier when provided', () => {
    const s = source({ comments: [{ path: 'a.ts', line: 1, body: 'security bug' }] });
    const findings = extractPrReviewFindingInputs(s, () => ({ severity: 'error', category: 'security' }));
    expect(findings[0]).toMatchObject({ severity: 'error', category: 'security' });
  });

  it('falls back to null category when the classifier returns an unknown value', () => {
    const s = source({ comments: [{ path: 'a.ts', line: 1, body: 'weird' }] });
    const findings = extractPrReviewFindingInputs(s, () => ({ severity: 'warn', category: 'not-a-real-category' }));
    expect(findings[0]).toMatchObject({ severity: 'warn', category: null });
  });

  it('creates a single body finding for CHANGES_REQUESTED with no comments', () => {
    const s = source({ state: 'CHANGES_REQUESTED', body: 'please refactor', comments: [] });
    const findings = extractPrReviewFindingInputs(s);
    expect(findings).toEqual([
      {
        findingIndex: 0,
        targetFilePath: null,
        targetLineStart: null,
        targetLineEnd: null,
        category: null,
        severity: null,
        findingText: 'please refactor',
        suggestionText: '',
      },
    ]);
  });

  it('produces no findings for COMMENTED/APPROVED with no comments', () => {
    expect(extractPrReviewFindingInputs(source({ state: 'COMMENTED', body: 'looks ok' }))).toEqual([]);
    expect(extractPrReviewFindingInputs(source({ state: 'APPROVED', body: 'lgtm' }))).toEqual([]);
  });

  it('produces no findings for an empty review', () => {
    expect(extractPrReviewFindingInputs(source({ state: 'CHANGES_REQUESTED', body: '   ' }))).toEqual([]);
  });
});
