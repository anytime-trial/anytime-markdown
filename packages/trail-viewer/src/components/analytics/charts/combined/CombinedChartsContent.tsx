import { useMemo } from 'react';
import type { CombinedData } from '../../../../domain/parser/types';
import type {
  AgentMetric,
  ChartMetric,
  CombinedChartKind,
  CommitMetric,
  PeriodDays,
  ToolChartMetric,
} from '../../types';
import { computeCombinedAxisInfo } from './axisInfo';
import { ToolsCombinedChart } from './ToolsCombinedChart';
import { ErrorToolsCombinedChart } from './ErrorToolsCombinedChart';
import { ReposCombinedChart } from './ReposCombinedChart';
import { SkillsCombinedChart } from './SkillsCombinedChart';
import { AgentsCombinedChart } from './AgentsCombinedChart';
import { CommitsCombinedChart } from './CommitsCombinedChart';
import { LeadTimeOverlay } from './LeadTimeOverlay';
import { ModelsCombinedChart } from './ModelsCombinedChart';

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
  const axisInfo = useMemo(() => computeCombinedAxisInfo(data, periodDays), [data, periodDays]);
  if (!axisInfo) return null;

  const canDrill = periodDays < 90 && !!onDateClick;

  if (activeChart === 'tools') {
    if (toolMetric === 'error') {
      return <ErrorToolsCombinedChart axisInfo={axisInfo} canDrill={canDrill} onDateClick={onDateClick} />;
    }
    return <ToolsCombinedChart axisInfo={axisInfo} toolMetric={toolMetric} canDrill={canDrill} onDateClick={onDateClick} />;
  }
  if (activeChart === 'repos') {
    return <ReposCombinedChart axisInfo={axisInfo} repoMetric={repoMetric} canDrill={canDrill} onDateClick={onDateClick} />;
  }
  if (activeChart === 'skills') {
    return <SkillsCombinedChart axisInfo={axisInfo} canDrill={canDrill} onDateClick={onDateClick} />;
  }
  if (activeChart === 'agents') {
    return <AgentsCombinedChart axisInfo={axisInfo} agentMetric={agentMetric} canDrill={canDrill} onDateClick={onDateClick} />;
  }
  if (activeChart === 'commits') {
    return commitMetric === 'leadTime'
      ? <LeadTimeOverlay leadTimeOverlay={leadTimeOverlay} canDrill={canDrill} onDateClick={onDateClick} />
      : <CommitsCombinedChart axisInfo={axisInfo} commitMetric={commitMetric} canDrill={canDrill} onDateClick={onDateClick} />;
  }
  // default: 'models'
  return <ModelsCombinedChart axisInfo={axisInfo} modelMetric={modelMetric} canDrill={canDrill} onDateClick={onDateClick} />;
}
