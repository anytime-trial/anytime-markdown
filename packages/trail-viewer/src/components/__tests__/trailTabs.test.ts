import { getTrailViewerTabDefs, isC4RelatedTab, isChatTab, normalizeTrailInitialTab } from '../trailTabs';

describe('trail viewer tab definitions', () => {
  it('does not include the legacy Releases / Prompts / Messages tabs in top-level tabs', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.releases')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.prompts')).toBe(false);
    expect(tabs.some((tab) => tab.i18nKey === 'viewer.tab.messages')).toBe(false);
  });

  // 掲示順の正本。`value` は歴史的な採番で順序を表さないため、i18n キーの並びで検査する
  // （値の列だけを見ると「番号順に並んでいないのは壊れている」と読み違える）。
  it('orders tabs as Activity / Flight Record / C4 / Knowledge Graph / Pipeline / Trace / Function Tree / Chat', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: true, hasTrace: true });

    expect(tabs.map((tab) => tab.i18nKey)).toEqual([
      'viewer.tab.analytics',
      'viewer.tab.flightRecord',
      'viewer.tab.model',
      'viewer.tab.knowledgeGraph',
      'viewer.tab.caravan',
      'viewer.tab.trace',
      'viewer.tab.functionTree',
      'viewer.tab.chat',
    ]);
    expect(tabs.map((tab) => tab.value)).toEqual([0, 9, 4, 11, 6, 5, 7, 10]);
    // panelId は value 由来。並べ替えで対応がずれるとタブと中身が食い違う。
    expect(tabs.map((tab) => tab.panelId)).toEqual(tabs.map((tab) => `trail-panel-${tab.value}`));
  });

  it('keeps the relative order when the C4 / trace tabs are unavailable', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: false, hasTrace: false });

    // C4 依存タブ（model=4 / trace=5 / functionTree=7）が落ちても残りの順序は変わらない。
    expect(tabs.map((tab) => tab.i18nKey)).toEqual([
      'viewer.tab.analytics',
      'viewer.tab.flightRecord',
      'viewer.tab.knowledgeGraph',
      'viewer.tab.caravan',
      'viewer.tab.chat',
    ]);
  });

  it('shows trace without the C4-only tabs when only trace data exists', () => {
    const tabs = getTrailViewerTabDefs({ hasC4: false, hasTrace: true });

    expect(tabs.map((tab) => tab.i18nKey)).toEqual([
      'viewer.tab.analytics',
      'viewer.tab.flightRecord',
      'viewer.tab.knowledgeGraph',
      'viewer.tab.caravan',
      'viewer.tab.trace',
      'viewer.tab.chat',
    ]);
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
