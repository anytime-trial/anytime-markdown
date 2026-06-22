import type React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { ToolMetrics, TrailSession } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountSessionMetricsPanel } from '../../../views/analytics/panels/sessionMetricsPanel';

export function SessionMetricsPanel({
  session,
  toolMetrics,
}: Readonly<{
  session: TrailSession;
  toolMetrics?: ToolMetrics | null;
}>): React.ReactElement {
  const { cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountSessionMetricsPanel}
      props={{ session, toolMetrics, cardSx, t: tStr }}
    />
  );
}
