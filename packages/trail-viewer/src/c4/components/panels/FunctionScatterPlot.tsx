import * as React from 'react';
import { BubbleCanvas } from '../../canvas/BubbleCanvas';
import type { BubblePoint } from '../../canvas/BubbleCanvas';
import { GalaxyCanvas } from '../../canvas/GalaxyCanvas';
import { CodeCityCanvas } from '../../canvas/CodeCityCanvas';
import { TourMode } from '../../canvas/TourMode';
import { selectTourTargets } from '../../canvas/tourTargets';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import type { FunctionAnalysisApiEntry } from '../../hooks/fetchFunctionAnalysisApi';
import { useTrailTheme } from '../../../components/TrailThemeContext';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountFunctionScatterPlotPanel, type FunctionScatterPlotPanelProps } from '../../../views/c4/panels/functionScatterPlotPanel';

interface Colors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
}

export interface FunctionScatterPlotProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly t: (key: string) => string;
  readonly colors: Colors;
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly filterElementId?: string | null;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

export type ComplexityTier = 'low' | 'mid' | 'high';

export interface TierConfig {
  readonly tier: ComplexityTier;
  readonly markerSize: number;
  readonly label: string;
}

export const COMPLEXITY_TIERS: readonly TierConfig[] = [
  { tier: 'low',  markerSize: 4,  label: '0–4' },
  { tier: 'mid',  markerSize: 9,  label: '5–14' },
  { tier: 'high', markerSize: 16, label: '15+' },
];

export function assignComplexityTier(cognitiveComplexity: number): ComplexityTier {
  if (cognitiveComplexity <= 4) return 'low';
  if (cognitiveComplexity <= 14) return 'mid';
  return 'high';
}

export interface BubbleSeriesItem {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly markerSize: number;
  readonly data: ReadonlyArray<{ readonly x: number; readonly y: number; readonly id: string }>;
}

export function buildBubbleSeries(
  entries: readonly FunctionAnalysisApiEntry[],
): BubbleSeriesItem[] {
  const result: BubbleSeriesItem[] = [];
  for (const role of ALL_ROLES) {
    for (const tierConfig of COMPLEXITY_TIERS) {
      const filtered = entries.filter(
        (e) => e.functionRole === role && assignComplexityTier(e.cognitiveComplexity) === tierConfig.tier,
      );
      if (filtered.length === 0) continue;
      result.push({
        id: `${role}-${tierConfig.tier}`,
        label: `${role} (${tierConfig.label})`,
        color: ROLE_COLORS[role],
        markerSize: tierConfig.markerSize,
        data: filtered.map((entry, idx) => ({
          x: entry.fanIn,
          y: entry.fanOut,
          id: `${role}-${tierConfig.tier}-${idx}`,
        })),
      });
    }
  }
  return result;
}

export function toBubblePoints(
  entries: readonly FunctionAnalysisApiEntry[],
): BubblePoint[] {
  return entries.map((e) => ({
    x: e.fanIn,
    y: e.fanOut,
    role: e.functionRole,
    tier: assignComplexityTier(e.cognitiveComplexity),
    label: e.functionName,
    file: e.filePath,
    fanIn: e.fanIn,
    fanOut: e.fanOut,
    cc: e.cognitiveComplexity,
    startLine: e.startLine,
  }));
}

const ALL_ROLES: readonly FunctionRole[] = ['hub', 'orchestrator', 'leaf', 'peripheral'];

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

type ViewMode = 'scatter' | 'galaxy' | 'city';

export const FunctionScatterPlot: React.FC<FunctionScatterPlotProps> = ({
  entries,
  t,
  colors,
  onFunctionOpen,
}) => {
  const [view, setView] = React.useState<ViewMode>('scatter');
  const [tourActive, setTourActive] = React.useState(false);
  const [tourTarget, setTourTarget] = React.useState<
    { file: string; label: string; startLine: number } | null
  >(null);
  const trailTheme = useTrailTheme();
  const isDark = trailTheme.isDark;

  const tourSteps = React.useMemo(() => selectTourTargets(entries), [entries]);

  if (entries.length === 0) {
    return (
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 16, paddingTop: 8, paddingLeft: 8, paddingRight: 8 }}>
        <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>{t('c4.scatter.empty')}</span>
      </div>
    );
  }

  const startTour = (): void => {
    if (tourSteps.length === 0) return;
    setView('scatter');
    setTourActive(true);
  };
  const stopTour = (): void => {
    setTourActive(false);
    setTourTarget(null);
  };

  const toolbarProps: FunctionScatterPlotPanelProps = {
    view,
    tourActive,
    tourStepsCount: tourSteps.length,
    onViewChange: setView,
    onTourToggle: tourActive ? stopTour : startTour,
    colors,
    t,
  };

  return (
    <div style={{
      borderTop: `1px solid ${colors.border}`,
      marginTop: 16,
      paddingTop: 8,
      paddingLeft: 8,
      paddingRight: 8,
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <VanillaIsland mount={mountFunctionScatterPlotPanel} props={toolbarProps} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {view === 'scatter' && (
          <BubbleCanvas
            points={toBubblePoints(entries)}
            height="100%"
            focusPoint={tourActive ? tourTarget : null}
            onPointClick={(pt) => {
              if (onFunctionOpen) onFunctionOpen(pt.file, pt.label, pt.startLine);
            }}
          />
        )}
        {view === 'galaxy' && (
          <GalaxyCanvas entries={entries} height="100%" onFunctionOpen={onFunctionOpen} />
        )}
        {view === 'city' && (
          <CodeCityCanvas entries={entries} height="100%" onFunctionOpen={onFunctionOpen} />
        )}
        {tourActive && view === 'scatter' && (
          <TourMode
            steps={tourSteps}
            onStepChange={(target) => setTourTarget(target)}
            onClose={stopTour}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
};

