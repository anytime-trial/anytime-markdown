import { useTrailTheme } from '../../../TrailThemeContext';
import { useCommitCategory } from '../../../CommitCategoryContext';
import type { CommitMetric } from '../../types';
import type { CombinedAxisInfo } from './axisInfo';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountCommitsCombinedChart } from '../../../../views/analytics/charts/combined/commitsCombinedChart';

// Re-export the pure function so existing callers and tests continue to work.
export { buildCumulativeCommitDataset } from '../../../../views/analytics/charts/combined/commitsCombinedChart';

export function CommitsCombinedChart({
  axisInfo,
  commitMetric,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  commitMetric: CommitMetric;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, isDark } = useTrailTheme();
  const { getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys } = useCommitCategory();

  return (
    <VanillaIsland
      mount={mountCommitsCombinedChart}
      props={{
        axisInfo, commitMetric, canDrill, onDateClick, isDark, cardSx,
        getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys,
      }}
    />
  );
}
