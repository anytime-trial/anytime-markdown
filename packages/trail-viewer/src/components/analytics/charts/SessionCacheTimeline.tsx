import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailMessage, TrailSession } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountSessionCacheTimeline } from '../../../views/analytics/charts/sessionCacheTimeline';

export function SessionCacheTimeline(
  props: Readonly<{
    messages: readonly TrailMessage[];
    session: TrailSession;
  }>,
) {
  const { colors, chartColors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountSessionCacheTimeline}
      props={{ ...props, colors, chartColors, cardSx, isDark, t: tStr }}
    />
  );
}
