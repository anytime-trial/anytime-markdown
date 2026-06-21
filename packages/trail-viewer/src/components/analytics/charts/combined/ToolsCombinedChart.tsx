import { useTrailTheme } from '../../../TrailThemeContext';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountToolsCombinedChart } from '../../../../views/analytics/charts/combined/toolsCombinedChart';

export function ToolsCombinedChart({
  axisInfo,
  toolMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  toolMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, isDark } = useTrailTheme();
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();

  return (
    <VanillaIsland
      mount={mountToolsCombinedChart}
      props={{
        axisInfo, toolMetric, canDrill, onDateClick, isDark, cardSx,
        getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys,
      }}
    />
  );
}
