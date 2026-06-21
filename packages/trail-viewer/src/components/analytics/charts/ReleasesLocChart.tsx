import React from 'react';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountReleasesLocChart } from '../../../views/analytics/charts/releasesLocChart';

export function ReleasesLocChart(props: Readonly<{ releases: readonly TrailRelease[] }>) {
  const { colors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountReleasesLocChart}
      props={{ ...props, colors, cardSx, isDark, t: tStr }}
    />
  );
}
