import { useTrailTheme } from '../../../TrailThemeContext';
import type { CombinedAxisInfo } from './axisInfo';
import { useToolCategory } from '../../../ToolCategoryContext';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountErrorToolsCombinedChart } from '../../../../views/analytics/charts/combined/errorToolsCombinedChart';

export function ErrorToolsCombinedChart({
  axisInfo,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, isDark } = useTrailTheme();
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();

  return (
    <VanillaIsland
      mount={mountErrorToolsCombinedChart}
      props={{
        axisInfo, canDrill, onDateClick, isDark, cardSx,
        getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys,
      }}
    />
  );
}
