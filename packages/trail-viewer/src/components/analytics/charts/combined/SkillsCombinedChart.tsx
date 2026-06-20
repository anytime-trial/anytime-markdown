import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTrailTheme } from '../../../TrailThemeContext';
import type { CombinedAxisInfo } from './axisInfo';
import { makeCategoryClick } from './axisInfo';
import { useSkillCategory } from '../../../SkillCategoryContext';
import { AnytimeChartView } from '../AnytimeChartView';
import { buildStackedBarSpec } from '../specs/buildStackedBarSpec';

export function SkillsCombinedChart({
  axisInfo,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx } = useTrailTheme();
  const { getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys } = useSkillCategory();
  const { skillRows, allPeriods, labels } = axisInfo;

  const spec = useMemo(() => {
    const valMap = new Map<string, number>();
    for (const r of skillRows) {
      const cat = getSkillCategory(r.skill);
      valMap.set(`${r.period}::${cat}`, (valMap.get(`${r.period}::${cat}`) ?? 0) + r.count);
    }
    return buildStackedBarSpec({
      categories: labels,
      series: skillCategoryKeys.map((cat) => ({
        name: getSkillCategoryLabel(cat),
        values: allPeriods.map((p) => valMap.get(`${p}::${cat}`) ?? 0),
        color: getSkillCategoryColorByIndex(cat),
      })),
    });
  }, [skillRows, allPeriods, labels, getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys]);

  if (skillRows.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <AnytimeChartView spec={spec} height={240} onCategoryClick={makeCategoryClick(allPeriods, canDrill, onDateClick)} />
    </Paper>
  );
}
