import type React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type { AnalyticsData, TrailSession } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountOverviewCards } from '../../../views/analytics/panels/overviewCards';

export function OverviewCards({
  totals,
  sessions = [],
  qualityMetrics = null,
  releases = [],
}: Readonly<{
  totals: AnalyticsData['totals'];
  sessions?: readonly TrailSession[];
  qualityMetrics?: QualityMetrics | null;
  releases?: readonly TrailRelease[];
}>): React.ReactElement {
  const { cardSx, doraColors } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountOverviewCards}
      props={{
        totals,
        sessions,
        qualityMetrics,
        releases,
        cardSx,
        doraColors: doraColors as unknown as Readonly<Record<string, string>>,
        t: tStr,
      }}
    />
  );
}
