import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountModelsCombinedChart } from '../../../../views/analytics/charts/combined/modelsCombinedChart';

export function ModelsCombinedChart({
  axisInfo,
  modelMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  modelMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  return (
    <VanillaIsland
      mount={mountModelsCombinedChart}
      props={{ axisInfo, modelMetric, canDrill, onDateClick, isDark, toolPalette, cardSx, t: tStr }}
    />
  );
}
