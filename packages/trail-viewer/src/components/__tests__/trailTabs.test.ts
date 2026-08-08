import { getTrailViewerTabDefs, isC4RelatedTab, isChatTab, normalizeTrailInitialTab } from '../trailTabs';

describe('trail viewer tab definitions', () => {
  it('does not include the legacy Releases / Prompts / Messages tabs in top-level tabs', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.map((tab) => tab.value)).toEqual([0, 4, 5, 7, 6, 9, 11, 10]);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.releases')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.prompts')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.messages')).toBe(false);
  });

  it('places Knowledge Graph immediately to the right of Flight Record, with Chat last', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: false, hasTrace: false });
    const values = tabs.map((tab) => tab.value);

    expect(values.at(-3)).toBe(9);
    expect(values.at(-2)).toBe(11);
    expect(values.at(-1)).toBe(10);
    expect(tabs.at(-2)?.i18nKey).toBe('viewer.tab.knowledgeGraph');
    expect(tabs.at(-2)?.panelId).toBe('trail-panel-11');
    expect(tabs.at(-1)?.i18nKey).toBe('viewer.tab.chat');
    expect(tabs.at(-1)?.panelId).toBe('trail-panel-10');
  });

  it('accepts 10 (Chat) and 11 (Knowledge Graph) as deep-linkable initialTab values', () => {
    expect(normalizeTrailInitialTab(10, { hasC4: false, hasTrace: false })).toBe(10);
    expect(normalizeTrailInitialTab(11, { hasC4: false, hasTrace: false })).toBe(11);
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

  it('returns false for non-C4 tabs so C4 fetch stays deferred (analytics=0 / memory=6 / flightReview=9)', () => {
    expect(isC4RelatedTab(0)).toBe(false);
    expect(isC4RelatedTab(6)).toBe(false);
    expect(isC4RelatedTab(9)).toBe(false);
    expect(isC4RelatedTab(10)).toBe(false);
  });
});

describe('isChatTab', () => {
  it('returns true only for the Chat tab so the ChatBridge is created on its first visit', () => {
    expect(isChatTab(10)).toBe(true);
  });

  it('returns false for Memory (6) — Chat is no longer a Memory sub-tab', () => {
    expect(isChatTab(6)).toBe(false);
    expect(isChatTab(0)).toBe(false);
    expect(isChatTab(9)).toBe(false);
  });
});
