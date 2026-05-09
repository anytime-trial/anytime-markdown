import { getTrailViewerTabDefs, normalizeTrailInitialTab } from '../trailTabs';

describe('trail viewer tab definitions', () => {
  it('does not include the legacy Releases tab in top-level tabs', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.map((tab) => tab.value)).toEqual([0, 1, 2, 4, 5]);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.releases')).toBe(false);
  });

  it('normalizes legacy initialTab=3 to Activity', () => {
    expect(normalizeTrailInitialTab(3, { hasC4: true, hasTrace: true })).toBe(0);
  });
});
