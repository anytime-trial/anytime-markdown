import type { TrailI18n } from '../i18n/types';

export type TrailViewerTabValue = 0 | 4 | 5 | 6 | 7 | 8 | 9;

export interface TrailViewerTabDef {
  readonly value: TrailViewerTabValue;
  readonly id: string;
  readonly panelId: string;
  readonly i18nKey: keyof TrailI18n;
  readonly preloadIndex?: number;
}

export interface TrailViewerTabOptions {
  readonly hasC4: boolean;
  readonly hasTrace: boolean;
}

export function getTrailViewerTabDefs({
  hasC4,
  hasTrace,
}: TrailViewerTabOptions): ReadonlyArray<TrailViewerTabDef> {
  const tabs: TrailViewerTabDef[] = [
    { value: 0, id: 'trail-tab-0', panelId: 'trail-panel-0', i18nKey: 'viewer.tab.analytics', preloadIndex: 0 },
  ];

  if (hasC4) {
    tabs.push({ value: 4, id: 'trail-tab-4', panelId: 'trail-panel-4', i18nKey: 'viewer.tab.model', preloadIndex: 4 });
  }
  if (hasTrace || hasC4) {
    tabs.push({ value: 5, id: 'trail-tab-5', panelId: 'trail-panel-5', i18nKey: 'viewer.tab.trace' });
  }
  if (hasC4) {
    tabs.push({ value: 7, id: 'trail-tab-7', panelId: 'trail-panel-7', i18nKey: 'viewer.tab.functionTree' });
  }

  tabs.push({ value: 6, id: 'trail-tab-6', panelId: 'trail-panel-6', i18nKey: 'viewer.tab.memory' });
  tabs.push({ value: 9, id: 'trail-tab-9', panelId: 'trail-panel-9', i18nKey: 'viewer.tab.flightReview' });
  tabs.push({ value: 8, id: 'trail-tab-8', panelId: 'trail-panel-8', i18nKey: 'viewer.tab.logs' });

  return tabs;
}

export function normalizeTrailInitialTab(
  initialTab: number | undefined,
  options: TrailViewerTabOptions,
): TrailViewerTabValue {
  const tabs = getTrailViewerTabDefs(options);
  return tabs.some((tab) => tab.value === initialTab) ? initialTab as TrailViewerTabValue : 0;
}

/**
 * C4 データソース（model / dsm / coverage 等の取得と WS 接続）を必要とするタブか。
 * model(4) / trace(5) / functionTree(7) はいずれも C4 データに依存する。
 * これらの初回訪問まで `useC4DataSource` の取得を遅延するために使う。
 */
export function isC4RelatedTab(tab: number): boolean {
  return tab === 4 || tab === 5 || tab === 7;
}

/** Memory タブ（value 6）かどうか。ChatBridge の遅延生成トリガに使う。 */
export function isMemoryTab(tab: number): boolean {
  return tab === 6;
}
