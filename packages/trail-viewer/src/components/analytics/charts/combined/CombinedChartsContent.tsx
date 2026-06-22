import { useTrailTheme } from '../../../TrailThemeContext';
import { useTrailI18n } from '../../../../i18n';
import { useToolCategory } from '../../../ToolCategoryContext';
import { useSkillCategory } from '../../../SkillCategoryContext';
import { useCommitCategory } from '../../../CommitCategoryContext';
import type { CombinedData } from '../../../../domain/parser/types';
import type {
  AgentMetric,
  ChartMetric,
  CombinedChartKind,
  CommitMetric,
  PeriodDays,
  ToolChartMetric,
} from '../../types';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountCombinedChartsContent } from '../../../../views/analytics/charts/combined/combinedChartsContent';

export function CombinedChartsContent({
  data,
  periodDays,
  activeChart,
  toolMetric,
  modelMetric,
  agentMetric,
  commitMetric,
  repoMetric,
  leadTimeOverlay,
  onDateClick,
}: Readonly<{
  data: CombinedData | null;
  periodDays: PeriodDays;
  activeChart: CombinedChartKind;
  toolMetric: ToolChartMetric;
  modelMetric: ChartMetric;
  agentMetric: AgentMetric;
  commitMetric: CommitMetric;
  repoMetric: ChartMetric;
  leadTimeOverlay: {
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    unmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    byPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
  } | null;
  onDateClick?: (fullDate: string) => void;
}>) {
  const { cardSx, toolPalette, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();
  const { getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys } = useSkillCategory();
  const { getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys } = useCommitCategory();

  return (
    <VanillaIsland
      mount={mountCombinedChartsContent}
      props={{
        data, periodDays, activeChart, toolMetric, modelMetric,
        agentMetric, commitMetric, repoMetric, leadTimeOverlay, onDateClick,
        theme: {
          isDark, toolPalette, cardSx, t: tStr,
          getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys,
          getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys,
          getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys,
        },
      }}
    />
  );
}
