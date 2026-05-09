import type { CombinedData } from '../../../../domain/parser/types';
import { capTopN } from '../../../../domain/analytics/calculators';
import type { PeriodDays } from '../../types';

export function computeCombinedAxisInfo(data: CombinedData | null, periodDays: PeriodDays) {
  if (!data) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const toolRows = (data.toolCounts ?? []).filter(r => r.period >= cutoffStr);
  const errorRows = (data.errorRate ?? []).filter(r => r.period >= cutoffStr);
  const skillRows = (data.skillStats ?? []).filter(r => r.period >= cutoffStr);
  const modelRows = (data.modelStats ?? []).filter(r => r.period >= cutoffStr);
  const agentRows = (data.agentStats ?? []).filter(r => r.period >= cutoffStr);
  const commitRows = (data.commitPrefixStats ?? []).filter(r => r.period >= cutoffStr);
  const repoRows = (data.repoStats ?? []).filter(r => r.period >= cutoffStr);
  const aiRateRows = (data.aiFirstTryRate ?? []).filter(r => r.period >= cutoffStr);
  const allPeriods = [...new Set(toolRows.map(r => r.period))].sort();
  const labels = allPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const modelPeriods = [...new Set(modelRows.map(r => r.period))].sort();
  const modelLabels = modelPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const agentPeriods = [...new Set(agentRows.map(r => r.period))].sort();
  const agentLabels = agentPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const commitPeriods = [...new Set(commitRows.map(r => r.period))].sort();
  const commitLabels = commitPeriods.map(p => p.length > 5 ? p.slice(5) : p);
  const repoPeriods = [...new Set(repoRows.map(r => r.period))].sort();
  const repoLabels = repoPeriods.map(p => p.length > 5 ? p.slice(5) : p);

  const toolTotals = new Map<string, number>();
  for (const r of toolRows) toolTotals.set(r.tool, (toolTotals.get(r.tool) ?? 0) + r.count);
  const errToolTotals = new Map<string, number>();
  for (const r of errorRows) for (const [k, v] of Object.entries(r.byTool)) errToolTotals.set(k, (errToolTotals.get(k) ?? 0) + v);
  const skillTotals = new Map<string, number>();
  for (const r of skillRows) skillTotals.set(r.skill, (skillTotals.get(r.skill) ?? 0) + r.count);
  const modelTotals = new Map<string, number>();
  for (const r of modelRows) modelTotals.set(r.model, (modelTotals.get(r.model) ?? 0) + r.count);
  const agentTotals = new Map<string, number>();
  for (const r of agentRows) agentTotals.set(r.agent, (agentTotals.get(r.agent) ?? 0) + r.tokens);
  const commitTotals = new Map<string, number>();
  for (const r of commitRows) commitTotals.set(r.prefix, (commitTotals.get(r.prefix) ?? 0) + r.count);
  const repoTotals = new Map<string, number>();
  for (const r of repoRows) repoTotals.set(r.repoName, (repoTotals.get(r.repoName) ?? 0) + r.count);

  const toolCap = capTopN(toolTotals);
  const errCap = capTopN(errToolTotals);
  const skillCap = capTopN(skillTotals);
  const modelCap = capTopN(modelTotals);
  const agentCap = capTopN(agentTotals);
  const commitCap = capTopN(commitTotals);
  const repoCap = capTopN(repoTotals);
  const agentMissingByDisplay = new Map<string, { total: number; missing: number }>();
  for (const r of agentRows) {
    const displayKey = agentCap.keyMap.get(r.agent) ?? r.agent;
    const cur = agentMissingByDisplay.get(displayKey) ?? { total: 0, missing: 0 };
    cur.total += r.tokenTotalTurns ?? 0;
    cur.missing += r.tokenMissingTurns ?? 0;
    agentMissingByDisplay.set(displayKey, cur);
  }
  const modelMissingByDisplay = new Map<string, { total: number; missing: number }>();
  for (const r of modelRows) {
    const displayKey = modelCap.keyMap.get(r.model) ?? r.model;
    const cur = modelMissingByDisplay.get(displayKey) ?? { total: 0, missing: 0 };
    cur.total += r.tokenTotalTurns ?? 0;
    cur.missing += r.tokenMissingTurns ?? 0;
    modelMissingByDisplay.set(displayKey, cur);
  }
  const toolMissingByDisplay = new Map<string, { total: number; missing: number }>();
  for (const r of toolRows) {
    const displayKey = toolCap.keyMap.get(r.tool) ?? r.tool;
    const cur = toolMissingByDisplay.get(displayKey) ?? { total: 0, missing: 0 };
    cur.total += r.tokenTotalTurns ?? 0;
    cur.missing += r.tokenMissingTurns ?? 0;
    toolMissingByDisplay.set(displayKey, cur);
  }

  const qualityRates = (data.qualityRates ?? []).filter(r => r.period >= cutoffStr);

  return {
    toolRows,
    errorRows,
    skillRows,
    modelRows,
    agentRows,
    commitRows,
    aiRateRows,
    qualityRates,
    allPeriods,
    labels,
    modelPeriods,
    modelLabels,
    agentPeriods,
    agentLabels,
    commitPeriods,
    commitLabels,
    tools: toolCap.displayKeys,
    toolMap: toolCap.keyMap,
    errTools: errCap.displayKeys,
    errMap: errCap.keyMap,
    skills: skillCap.displayKeys,
    skillMap: skillCap.keyMap,
    models: modelCap.displayKeys,
    modelMap: modelCap.keyMap,
    agents: agentCap.displayKeys,
    agentMap: agentCap.keyMap,
    agentMissingByDisplay,
    modelMissingByDisplay,
    toolMissingByDisplay,
    commitPrefixes: commitCap.displayKeys,
    commitMap: commitCap.keyMap,
    repoRows,
    repoPeriods,
    repoLabels,
    repos: repoCap.displayKeys,
    repoMap: repoCap.keyMap,
  };
}

export type CombinedAxisInfo = NonNullable<ReturnType<typeof computeCombinedAxisInfo>>;

export function makeAxisClick(periods: readonly string[], canDrill: boolean, onDateClick?: (date: string) => void) {
  return canDrill
    ? (_e: MouseEvent, d: { dataIndex: number } | null) => {
        const idx = d?.dataIndex;
        if (idx == null || idx < 0 || idx >= periods.length) return;
        onDateClick?.(periods[idx]);
      }
    : undefined;
}

export const hideZero = (v: number | null) => (v == null || v === 0 ? null : String(v));
