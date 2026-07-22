/**
 * agentsCombinedChart の系列組み立て（純粋部分）と agent ブランド色の解決。
 *
 * 回帰 1: 色引きが `agentBrandColors[agent]` だったが、`agent` は表示ラベル
 *         （'Claude Code' / 'Codex'）で agentBrandColors のキーは sessions.source 値
 *         （'claude_code' / 'codex'）。常に undefined でブランド色が出ていなかった。
 * 回帰 2: 凡例が欠損率を無条件に描画し、統計を持たない Supabase 経路
 *         （tokenTotalTurns を 0 固定）でも「欠損 0%」と断言していた。
 */
import { buildAgentSeries } from '../combined/agentsCombinedChart';
import { getAgentBrandColor, agentBrandColors } from '../../../../theme/designTokens';
import type { AgentsCombinedChartProps } from '../combined/agentsCombinedChart';
import type { CombinedAxisInfo } from '../../../../components/analytics/charts/combined/axisInfo';

const TOOL_PALETTE = ['#66BB6A', '#90CAF9', '#FFD54F'];
const t = (key: string): string => key;

function makeProps(over: {
  agents: string[];
  agentRows?: CombinedAxisInfo['agentRows'];
  missing?: Map<string, { total: number; missing: number }>;
}): AgentsCombinedChartProps {
  const axisInfo = {
    agentRows: over.agentRows ?? [],
    agentPeriods: ['2026-07-19'],
    agentLabels: ['07-19'],
    agents: over.agents,
    agentMap: new Map<string, string>(),
    agentMissingByDisplay: over.missing ?? new Map<string, { total: number; missing: number }>(),
  } as unknown as CombinedAxisInfo;
  return {
    axisInfo,
    agentMetric: 'tokens',
    canDrill: false,
    isDark: true,
    toolPalette: TOOL_PALETTE,
    cardSx: { bgcolor: '#121212', border: '1px solid #333', borderRadius: '12px' },
    t,
  };
}

describe('getAgentBrandColor', () => {
  it('表示ラベルからブランド色を解決する', () => {
    expect(getAgentBrandColor('Claude Code')).toBe(agentBrandColors.claude_code);
    expect(getAgentBrandColor('Codex')).toBe(agentBrandColors.codex);
  });

  it('schema が許す他の source の表示ラベルも解決する', () => {
    expect(getAgentBrandColor('Gemini')).toBe(agentBrandColors.gemini);
    expect(getAgentBrandColor('Cursor')).toBe(agentBrandColors.cursor);
  });

  it('未知のラベル（capTopN の Others 等）は undefined を返す', () => {
    expect(getAgentBrandColor('Others')).toBeUndefined();
    expect(getAgentBrandColor('claude_code')).toBeUndefined();
  });
});

describe('buildAgentSeries', () => {
  it('Codex 系列にブランド色が付く（汎用パレットへ落ちない）', () => {
    const series = buildAgentSeries(makeProps({ agents: ['Claude Code', 'Codex'] }));
    const codex = series.find((s) => s.name.startsWith('Codex'));
    expect(codex?.color).toBe(agentBrandColors.codex);
    expect(TOOL_PALETTE).not.toContain(codex?.color);
  });

  it('Claude Code 系列にブランド色が付く', () => {
    const series = buildAgentSeries(makeProps({ agents: ['Claude Code', 'Codex'] }));
    const claude = series.find((s) => s.name.startsWith('Claude Code'));
    expect(claude?.color).toBe(agentBrandColors.claude_code);
  });

  it('ブランド色を持たない系列は汎用パレットへフォールバックする', () => {
    const series = buildAgentSeries(makeProps({ agents: ['Others'] }));
    expect(TOOL_PALETTE).toContain(series[0]?.color);
  });

  it('欠損統計があるときは凡例に欠損率を出す', () => {
    const missing = new Map([['Codex', { total: 100, missing: 63 }]]);
    const series = buildAgentSeries(makeProps({ agents: ['Codex'], missing }));
    expect(series[0]?.name).toContain('analytics.combined.missingRate');
    expect(series[0]?.name).toContain('63');
  });

  it('欠損統計を持たない（total=0）ときは欠損率を出さない', () => {
    // Supabase 経路は tokenTotalTurns を 0 固定にしており、統計が「無い」。
    // 0% と断言せず素のラベルにする。
    const missing = new Map([['Codex', { total: 0, missing: 0 }]]);
    const series = buildAgentSeries(makeProps({ agents: ['Codex'], missing }));
    expect(series[0]?.name).toBe('Codex');
  });

  it('欠損エントリ自体が無いときも欠損率を出さない', () => {
    const series = buildAgentSeries(makeProps({ agents: ['Codex'] }));
    expect(series[0]?.name).toBe('Codex');
  });
});
