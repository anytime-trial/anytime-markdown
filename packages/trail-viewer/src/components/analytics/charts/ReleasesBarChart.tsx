import React from 'react';
import type { ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountReleasesBarChart } from '../../../views/analytics/charts/releasesBarChart';

export function ReleasesBarChart(
  props: Readonly<{ timeSeries: ReadonlyArray<ReleaseQualityBucket> }>,
) {
  const { colors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountReleasesBarChart}
      props={{ ...props, colors, cardSx, isDark, t: tStr }}
    />
  );
}
