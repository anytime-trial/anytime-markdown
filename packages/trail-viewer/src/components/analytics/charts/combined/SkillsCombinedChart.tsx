import { useTrailTheme } from '../../../TrailThemeContext';
import type { CombinedAxisInfo } from './axisInfo';
import { useSkillCategory } from '../../../SkillCategoryContext';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountSkillsCombinedChart } from '../../../../views/analytics/charts/combined/skillsCombinedChart';

export function SkillsCombinedChart({
  axisInfo,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, isDark } = useTrailTheme();
  const { getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys } = useSkillCategory();

  return (
    <VanillaIsland
      mount={mountSkillsCombinedChart}
      props={{
        axisInfo, canDrill, onDateClick, isDark, cardSx,
        getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys,
      }}
    />
  );
}
