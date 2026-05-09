import { getTrailViewerTabDefs, normalizeTrailInitialTab } from '../trailTabs';

describe('trail viewer tab definitions', () => {
  it('does not include the legacy Releases / Prompts / Messages tabs in top-level tabs', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.map((tab) => tab.value)).toEqual([0, 4, 5]);
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
