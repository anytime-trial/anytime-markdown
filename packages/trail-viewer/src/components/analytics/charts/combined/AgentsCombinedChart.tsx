import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import type { AgentMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountAgentsCombinedChart } from '../../../../views/analytics/charts/combined/agentsCombinedChart';

export function AgentsCombinedChart({
  axisInfo,
  agentMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  agentMetric: AgentMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  return (
    <VanillaIsland
      mount={mountAgentsCombinedChart}
      props={{ axisInfo, agentMetric, canDrill, onDateClick, isDark, toolPalette, cardSx, t: tStr }}
    />
  );
}
