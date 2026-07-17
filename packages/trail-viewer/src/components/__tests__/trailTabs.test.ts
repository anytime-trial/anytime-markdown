import { getTrailViewerTabDefs, isC4RelatedTab, normalizeTrailInitialTab } from '../trailTabs';

describe('trail viewer tab definitions', () => {
  it('does not include the legacy Releases / Prompts / Messages tabs in top-level tabs', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.map((tab) => tab.value)).toEqual([0, 4, 5, 7, 6, 9, 8]);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.releases')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.prompts')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.messages')).toBe(false);
  });

  it('normalizes legacy initialTab values (3=releases / 2=prompts / 1=messages) to Activity', () => {
    expect(normalizeTrailInitialTab(3, { hasC4: true, hasTrace: true })).toBe(0);
    expect(normalizeTrailInitialTab(2, { hasC4: true, hasTrace: true })).toBe(0);
    expect(normalizeTrailInitialTab(1, { hasC4: true, hasTrace: true })).toBe(0);
  });
});

describe('isC4RelatedTab', () => {
  it('returns true only for C4-dependent tabs (model=4 / trace=5 / functionTree=7)', () => {
    expect(isC4RelatedTab(4)).toBe(true);
    expect(isC4RelatedTab(5)).toBe(true);
    expect(isC4RelatedTab(7)).toBe(true);
  });

  it('returns false for non-C4 tabs so C4 fetch stays deferred (analytics=0 / memory=6 / logs=8 / flightReview=9)', () => {
    expect(isC4RelatedTab(0)).toBe(false);
    expect(isC4RelatedTab(6)).toBe(false);
    expect(isC4RelatedTab(8)).toBe(false);
    expect(isC4RelatedTab(9)).toBe(false);
  });
});
