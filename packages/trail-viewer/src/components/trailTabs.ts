import type { TrailI18n } from '../i18n/types';

export type TrailViewerTabValue = 0 | 4 | 5;

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

  return tabs;
}

export function normalizeTrailInitialTab(
  initialTab: number | undefined,
  options: TrailViewerTabOptions,
): TrailViewerTabValue {
  const tabs = getTrailViewerTabDefs(options);
  return tabs.some((tab) => tab.value === initialTab) ? initialTab as TrailViewerTabValue : 0;
}
