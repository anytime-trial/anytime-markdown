import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailSessionCommit } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountSessionCommitPrefixChart } from '../../../views/analytics/charts/sessionCommitPrefixChart';

export function SessionCommitPrefixChart(
  props: Readonly<{
    sessionId: string;
    fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
  }>,
) {
  const { colors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountSessionCommitPrefixChart}
      props={{ ...props, colors, cardSx, isDark, t: tStr }}
    />
  );
}
