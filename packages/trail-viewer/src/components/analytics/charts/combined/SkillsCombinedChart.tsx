import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTrailTheme } from '../../../TrailThemeContext';
import { fmtNum } from '../../../../domain/analytics/formatters';
import type { CombinedAxisInfo } from './axisInfo';
import { hideZero, makeAxisClick } from './axisInfo';
import { useSkillCategory } from '../../../SkillCategoryContext';

const SKILL_CATEGORY_LABELS = ['開発フロー', 'ドキュメント', '調査・分析', 'AIツール', 'その他'] as const;
const CATEGORIES = [0, 1, 2, 3, 4] as const;

export function SkillsCombinedChart({
  axisInfo,
  canDrill,
  onDateClick,
}: Readonly<{
  axisInfo: CombinedAxisInfo;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, skillCategoryColors } = useTrailTheme();
  const { getSkillCategory } = useSkillCategory();
  const { skillRows, allPeriods, labels } = axisInfo;

  const dataset = useMemo(() => {
    const valMap = new Map<string, number>();
    for (const r of skillRows) {
      const cat = getSkillCategory(r.skill);
      const key = `${r.period}::${cat}`;
      valMap.set(key, (valMap.get(key) ?? 0) + r.count);
    }
    return allPeriods.map((p, pi) => {
      const entry: Record<string, string | number> = { period: labels[pi] };
      for (const cat of CATEGORIES) {
        entry[`s${cat}`] = valMap.get(`${p}::${cat}`) ?? 0;
      }
      return entry;
    });
  }, [skillRows, allPeriods, labels, getSkillCategory]);

  if (skillRows.length === 0) {
    return <Typography variant="body2" color="text.secondary">0</Typography>;
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: 2 }}>
      <BarChart
        dataset={dataset}
        xAxis={[{ scaleType: 'band', dataKey: 'period' }]}
        yAxis={[{ valueFormatter: fmtNum }]}
        series={CATEGORIES.map((cat) => ({
          dataKey: `s${cat}`,
          label: SKILL_CATEGORY_LABELS[cat],
          stack: 'total',
          color: skillCategoryColors[cat],
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
