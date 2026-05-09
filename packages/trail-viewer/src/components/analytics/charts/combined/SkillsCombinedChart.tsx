import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { fmtNum } from '../../../../domain/analytics/formatters';
import type { CombinedAxisInfo } from './axisInfo';
import { hideZero, makeAxisClick } from './axisInfo';
import { useSkillCategory } from '../../../SkillCategoryContext';

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
  const { getSkillCategory, getSkillCategoryColor } = useSkillCategory();
  const { skillRows, allPeriods, labels, skills, skillMap } = axisInfo;

  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => getSkillCategory(a) - getSkillCategory(b)),
    [skills, getSkillCategory],
  );

  const dataset = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const r of skillRows) {
      const displayKey = skillMap.get(r.skill) ?? r.skill;
      const key = `${r.period}::${displayKey}`;
      countMap.set(key, (countMap.get(key) ?? 0) + r.count);
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (let i = 0; i < sortedSkills.length; i++) {
        entry[`s${i}`] = countMap.get(`${p}::${sortedSkills[i]}`) ?? 0;
      }
      return entry;
    });
  }, [skillRows, allPeriods, labels, sortedSkills, skillMap]);

  if (sortedSkills.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: fmtNum }]}
        series={sortedSkills.map((skill, i) => ({
          dataKey: `s${i}`,
          label: skill,
          stack: 'total',
          color: getSkillCategoryColor(skill),
          valueFormatter: hideZero,
        }))}
        height={240}
        margin={{ left: 16, right: 8, top: 8, bottom: 40 }}
        slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
        onAxisClick={makeAxisClick(allPeriods, canDrill, onDateClick)}
      />
    </Paper>
  );
}
