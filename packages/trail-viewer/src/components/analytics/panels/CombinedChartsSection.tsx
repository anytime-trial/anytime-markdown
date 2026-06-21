import type React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { useToolCategory } from '../../ToolCategoryContext';
import { useSkillCategory } from '../../SkillCategoryContext';
import { useCommitCategory } from '../../CommitCategoryContext';
import type {
  AnalyticsData,
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../../domain/parser/types';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type {
  AgentMetric,
  ChartMetric,
  CombinedMetric,
  CommitMetric,
  DailyViewMode,
  PeriodDays,
  ToolChartMetric,
} from '../types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountCombinedChartsSection } from '../../../views/analytics/panels/combinedChartsSection';

export function CombinedChartsSection({
  dailyActivity,
  releases,
  sessions,
  sessionsLoading,
  period,
  setPeriod,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
  costOptimization,
  fetchCombinedData,
  fetchQualityMetrics,
  fetchReleaseQuality,
  onOpenReleasesPopup,
  onOpenPromptsPopup,
  onOpenMessagesPopup,
}: Readonly<{
  dailyActivity: AnalyticsData['dailyActivity'];
  releases?: readonly TrailRelease[];
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  period: PeriodDays;
  setPeriod: (v: PeriodDays) => void;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  costOptimization?: CostOptimizationData | null;
  fetchCombinedData?: (period: CombinedPeriodMode, rangeDays: CombinedRangeDays) => Promise<CombinedData>;
  fetchQualityMetrics?: (range: DateRange) => Promise<QualityMetrics | null>;
  fetchReleaseQuality?: (range: DateRange, bucket: 'day' | 'week') => Promise<ReadonlyArray<ReleaseQualityBucket>>;
  onOpenReleasesPopup?: () => void;
  onOpenPromptsPopup?: () => void;
  onOpenMessagesPopup?: () => void;
}>): React.ReactElement {
  const { colors, chartColors, cardSx, isDark, toolPalette } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);
  const { getToolCategory, getToolCategoryLabel, getToolCategoryColorByIndex, toolCategoryKeys } = useToolCategory();
  const { getSkillCategory, getSkillCategoryLabel, getSkillCategoryColorByIndex, skillCategoryKeys } = useSkillCategory();
  const { getCategory, getCategoryLabel, getCategoryColorByIndex, categoryKeys } = useCommitCategory();

  return (
    <VanillaIsland
      mount={mountCombinedChartsSection}
      props={{
        dailyActivity,
        releases,
        sessions,
        sessionsLoading,
        period,
        setPeriod,
        onSelectSession,
        onJumpToTrace,
        fetchSessionMessages,
        fetchSessionCommits,
        fetchSessionToolMetrics,
        fetchDayToolMetrics,
        costOptimization,
        fetchCombinedData,
        fetchQualityMetrics,
        fetchReleaseQuality,
        onOpenReleasesPopup,
        onOpenPromptsPopup,
        onOpenMessagesPopup,
        colors,
        chartColors,
        cardSx,
        isDark,
        toolPalette,
        t: tStr,
        combinedTheme: {
          isDark,
          toolPalette,
          cardSx,
          t: tStr,
          getToolCategory,
          getToolCategoryLabel,
          getToolCategoryColorByIndex,
          toolCategoryKeys,
          getSkillCategory,
          getSkillCategoryLabel,
          getSkillCategoryColorByIndex,
          skillCategoryKeys,
          getCategory,
          getCategoryLabel,
          getCategoryColorByIndex,
          categoryKeys,
        },
      }}
    />
  );
}
