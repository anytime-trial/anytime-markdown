/**
 * vanilla 版 CombinedChartsContent
 * (`components/analytics/charts/combined/CombinedChartsContent.tsx` の素 DOM 等価)。
 *
 * activeChart に応じて各 XxxCombinedChart vanilla view を切り替える。
 * 既存の mount を destroy して新しい mount を起動するか、同じ種別なら update する。
 */
import type { CombinedData } from '../../../../domain/parser/types';
import type {
  AgentMetric,
  ChartMetric,
  CombinedChartKind,
  CommitMetric,
  ToolChartMetric,
} from '../../../../components/analytics/types';
import { computeCombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';
import type { PeriodDays } from '../../../../components/analytics/types';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';
import { mountAgentsCombinedChart, type AgentsCombinedChartProps } from './agentsCombinedChart';
import { mountCommitsCombinedChart, type CommitsCombinedChartProps } from './commitsCombinedChart';
import { mountErrorToolsCombinedChart, type ErrorToolsCombinedChartProps } from './errorToolsCombinedChart';
import { mountLeadTimeOverlay, type LeadTimeOverlayProps } from './leadTimeOverlay';
import { mountModelsCombinedChart, type ModelsCombinedChartProps } from './modelsCombinedChart';
import { mountSkillsCombinedChart, type SkillsCombinedChartProps } from './skillsCombinedChart';
import { mountToolsCombinedChart, type ToolsCombinedChartProps } from './toolsCombinedChart';

// Shared theme/category props threaded through from React boundary
export interface CombinedChartsContentThemeProps {
  isDark: boolean;
  toolPalette: readonly string[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  t: (key: string) => string;
  // Tool category
  getToolCategory: (tool: string) => number;
  getToolCategoryLabel: (cat: number) => string;
  getToolCategoryColorByIndex: (cat: number) => string;
  toolCategoryKeys: readonly number[];
  // Skill category
  getSkillCategory: (skill: string) => number;
  getSkillCategoryLabel: (cat: number) => string;
  getSkillCategoryColorByIndex: (cat: number) => string;
  skillCategoryKeys: readonly number[];
  // Commit category
  getCategory: (prefix: string) => number;
  getCategoryLabel: (cat: number) => string;
  getCategoryColorByIndex: (cat: number) => string;
  categoryKeys: readonly number[];
}

export interface CombinedChartsContentProps {
  data: CombinedData | null;
  periodDays: PeriodDays;
  activeChart: CombinedChartKind;
  toolMetric: ToolChartMetric;
  modelMetric: ChartMetric;
  agentMetric: AgentMetric;
  commitMetric: CommitMetric;
  leadTimeOverlay: LeadTimeOverlayProps['leadTimeOverlay'];
  onDateClick?: (fullDate: string) => void;
  theme: CombinedChartsContentThemeProps;
}

type ActiveKind =
  | 'tools'
  | 'tools-error'
  | 'skills'
  | 'agents'
  | 'commits-leadTime'
  | 'commits'
  | 'models';

function resolveKind(p: CombinedChartsContentProps): ActiveKind {
  if (p.activeChart === 'tools') return p.toolMetric === 'error' ? 'tools-error' : 'tools';
  if (p.activeChart === 'skills') return 'skills';
  if (p.activeChart === 'agents') return 'agents';
  if (p.activeChart === 'commits') return p.commitMetric === 'leadTime' ? 'commits-leadTime' : 'commits';
  return 'models';
}

export function mountCombinedChartsContent(
  container: HTMLElement,
  initial: CombinedChartsContentProps,
): VanillaViewHandle<CombinedChartsContentProps> {
  let props = initial;
  let activeKind: ActiveKind | null = null;
  let childHandle: VanillaViewHandle<unknown> | null = null;

  function destroyChild(): void {
    childHandle?.destroy();
    childHandle = null;
    activeKind = null;
    container.replaceChildren();
  }

  function render(p: CombinedChartsContentProps): void {
    const axisInfo = computeCombinedAxisInfo(p.data, p.periodDays);
    if (!axisInfo) {
      destroyChild();
      return;
    }

    const kind = resolveKind(p);
    const canDrill = p.periodDays < 90 && !!p.onDateClick;
    const { theme } = p;

    if (kind !== activeKind) {
      destroyChild();
      activeKind = kind;

      if (kind === 'tools') {
        const mountProps: ToolsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          toolMetric: p.toolMetric as ChartMetric,
          isDark: theme.isDark, cardSx: theme.cardSx,
          getToolCategory: theme.getToolCategory,
          getToolCategoryLabel: theme.getToolCategoryLabel,
          getToolCategoryColorByIndex: theme.getToolCategoryColorByIndex,
          toolCategoryKeys: theme.toolCategoryKeys,
        };
        childHandle = mountToolsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      } else if (kind === 'tools-error') {
        const mountProps: ErrorToolsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          isDark: theme.isDark, cardSx: theme.cardSx,
          getToolCategory: theme.getToolCategory,
          getToolCategoryLabel: theme.getToolCategoryLabel,
          getToolCategoryColorByIndex: theme.getToolCategoryColorByIndex,
          toolCategoryKeys: theme.toolCategoryKeys,
        };
        childHandle = mountErrorToolsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      } else if (kind === 'skills') {
        const mountProps: SkillsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          isDark: theme.isDark, cardSx: theme.cardSx,
          getSkillCategory: theme.getSkillCategory,
          getSkillCategoryLabel: theme.getSkillCategoryLabel,
          getSkillCategoryColorByIndex: theme.getSkillCategoryColorByIndex,
          skillCategoryKeys: theme.skillCategoryKeys,
        };
        childHandle = mountSkillsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      } else if (kind === 'agents') {
        const mountProps: AgentsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          agentMetric: p.agentMetric,
          isDark: theme.isDark, cardSx: theme.cardSx,
          toolPalette: theme.toolPalette, t: theme.t,
        };
        childHandle = mountAgentsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      } else if (kind === 'commits-leadTime') {
        const mountProps: LeadTimeOverlayProps = {
          leadTimeOverlay: p.leadTimeOverlay, canDrill, onDateClick: p.onDateClick,
          isDark: theme.isDark, cardSx: theme.cardSx,
          toolPalette: theme.toolPalette,
        };
        childHandle = mountLeadTimeOverlay(container, mountProps) as VanillaViewHandle<unknown>;
      } else if (kind === 'commits') {
        const mountProps: CommitsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          commitMetric: p.commitMetric,
          isDark: theme.isDark, cardSx: theme.cardSx,
          getCategory: theme.getCategory,
          getCategoryLabel: theme.getCategoryLabel,
          getCategoryColorByIndex: theme.getCategoryColorByIndex,
          categoryKeys: theme.categoryKeys,
        };
        childHandle = mountCommitsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      } else {
        // models
        const mountProps: ModelsCombinedChartProps = {
          axisInfo, canDrill, onDateClick: p.onDateClick,
          modelMetric: p.modelMetric,
          isDark: theme.isDark, cardSx: theme.cardSx,
          toolPalette: theme.toolPalette, t: theme.t,
        };
        childHandle = mountModelsCombinedChart(container, mountProps) as VanillaViewHandle<unknown>;
      }
      return;
    }

    // Same kind — update existing child
    if (!childHandle) return;

    if (kind === 'tools') {
      (childHandle as VanillaViewHandle<ToolsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        toolMetric: p.toolMetric as ChartMetric,
        isDark: theme.isDark, cardSx: theme.cardSx,
        getToolCategory: theme.getToolCategory,
        getToolCategoryLabel: theme.getToolCategoryLabel,
        getToolCategoryColorByIndex: theme.getToolCategoryColorByIndex,
        toolCategoryKeys: theme.toolCategoryKeys,
      });
    } else if (kind === 'tools-error') {
      (childHandle as VanillaViewHandle<ErrorToolsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        isDark: theme.isDark, cardSx: theme.cardSx,
        getToolCategory: theme.getToolCategory,
        getToolCategoryLabel: theme.getToolCategoryLabel,
        getToolCategoryColorByIndex: theme.getToolCategoryColorByIndex,
        toolCategoryKeys: theme.toolCategoryKeys,
      });
    } else if (kind === 'skills') {
      (childHandle as VanillaViewHandle<SkillsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        isDark: theme.isDark, cardSx: theme.cardSx,
        getSkillCategory: theme.getSkillCategory,
        getSkillCategoryLabel: theme.getSkillCategoryLabel,
        getSkillCategoryColorByIndex: theme.getSkillCategoryColorByIndex,
        skillCategoryKeys: theme.skillCategoryKeys,
      });
    } else if (kind === 'agents') {
      (childHandle as VanillaViewHandle<AgentsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        agentMetric: p.agentMetric,
        isDark: theme.isDark, cardSx: theme.cardSx,
        toolPalette: theme.toolPalette, t: theme.t,
      });
    } else if (kind === 'commits-leadTime') {
      (childHandle as VanillaViewHandle<LeadTimeOverlayProps>).update({
        leadTimeOverlay: p.leadTimeOverlay, canDrill, onDateClick: p.onDateClick,
        isDark: theme.isDark, cardSx: theme.cardSx,
        toolPalette: theme.toolPalette,
      });
    } else if (kind === 'commits') {
      (childHandle as VanillaViewHandle<CommitsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        commitMetric: p.commitMetric,
        isDark: theme.isDark, cardSx: theme.cardSx,
        getCategory: theme.getCategory,
        getCategoryLabel: theme.getCategoryLabel,
        getCategoryColorByIndex: theme.getCategoryColorByIndex,
        categoryKeys: theme.categoryKeys,
      });
    } else {
      (childHandle as VanillaViewHandle<ModelsCombinedChartProps>).update({
        axisInfo, canDrill, onDateClick: p.onDateClick,
        modelMetric: p.modelMetric,
        isDark: theme.isDark, cardSx: theme.cardSx,
        toolPalette: theme.toolPalette, t: theme.t,
      });
    }
  }

  render(props);

  return {
    update(next) {
      props = next;
      render(next);
    },
    destroy() {
      destroyChild();
    },
  };
}
