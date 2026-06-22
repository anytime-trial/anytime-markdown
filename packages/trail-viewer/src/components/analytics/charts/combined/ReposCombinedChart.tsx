import { useTrailTheme } from '../../../TrailThemeContext';
import type { ChartMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountReposCombinedChart } from '../../../../views/analytics/charts/combined/reposCombinedChart';

export function ReposCombinedChart({
  axisInfo,
  repoMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  repoMetric: ChartMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette, isDark } = useTrailTheme();

  return (
    <VanillaIsland
      mount={mountReposCombinedChart}
      props={{ axisInfo, repoMetric, canDrill, onDateClick, isDark, toolPalette, cardSx }}
    />
  );
}
