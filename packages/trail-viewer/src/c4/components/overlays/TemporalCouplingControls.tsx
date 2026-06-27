import * as React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountTemporalCouplingControls,
  type TemporalCouplingControlsVanillaProps,
} from '../../../views/c4/overlays/temporalCouplingControls';

export type TemporalCouplingGranularity = 'commit' | 'session' | 'subagentType';
export type GhostEdgeMode = 'none' | 'commit' | 'session';

export interface TemporalCouplingControlsValue {
  enabled: boolean;
  windowDays: number;
  threshold: number;
  topK: number;
  directional: boolean;
  confidenceThreshold: number;
  directionalDiff: number;
  granularity: TemporalCouplingGranularity;
}

export interface TemporalCouplingControlsProps {
  readonly value: TemporalCouplingControlsValue;
  readonly onChange: (next: TemporalCouplingControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly showDirectionalControls?: boolean;
  readonly showSubagentGranularity?: boolean;
  readonly showCombinedGhostEdgeSelector?: boolean;
}

const WINDOW_OPTIONS: ReadonlyArray<{ label: string; days: number }> = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
];

const TOP_K_OPTIONS: ReadonlyArray<number> = [10, 50, 100];
const POPUP_GHOST_EDGE_MODES: ReadonlyArray<Exclude<GhostEdgeMode, 'none'>> = ['commit', 'session'];
const DEFAULT_GRANULARITIES: ReadonlyArray<TemporalCouplingGranularity> = [
  'commit',
  'session',
  'subagentType',
];

export function getTemporalCouplingGranularities(
  showSubagentGranularity: boolean,
): ReadonlyArray<TemporalCouplingGranularity> {
  return showSubagentGranularity ? DEFAULT_GRANULARITIES : ['commit', 'session'];
}

export function getGhostEdgeMode(value: Readonly<TemporalCouplingControlsValue>): GhostEdgeMode {
  if (!value.enabled) return 'none';
  return value.granularity === 'session' ? 'session' : 'commit';
}

export function getPopupGhostEdgeModes(): ReadonlyArray<Exclude<GhostEdgeMode, 'none'>> {
  return POPUP_GHOST_EDGE_MODES;
}

export function applyGhostEdgeMode(
  current: Readonly<TemporalCouplingControlsValue>,
  mode: GhostEdgeMode,
): TemporalCouplingControlsValue {
  if (mode === 'none') {
    return {
      ...current,
      enabled: false,
      directional: false,
    };
  }

  return {
    ...current,
    enabled: true,
    directional: false,
    granularity: mode,
  };
}

export function shouldShowTemporalCouplingInlineSettings(
  showCombinedGhostEdgeSelector: boolean,
): boolean {
  return !showCombinedGhostEdgeSelector;
}

/** 粒度別のしきい値デフォルト（plan/20260429-ghost-edge-* 第「パラメータの粒度別デフォルト」表） */
export const GRANULARITY_DEFAULT_THRESHOLD: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.5,
  session: 0.4,
  subagentType: 0.5,
};

/** Phase 5: 粒度別 Confidence デフォルト（commit→session→subagentType で段階的に緩める） */
export const GRANULARITY_DEFAULT_CONFIDENCE: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.5,
  session: 0.4,
  subagentType: 0.3,
};

/** Phase 5: 粒度別 directionalDiff デフォルト */
export const GRANULARITY_DEFAULT_DIRECTIONAL_DIFF: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.3,
  session: 0.25,
  subagentType: 0.2,
};

/**
 * 粒度切替時の値リセット計算（pure）。
 * - directional=false 時: Jaccard 閾値（threshold）のみ粒度別デフォルトへ
 * - directional=true 時: confidenceThreshold / directionalDiff も粒度別デフォルトへ
 */
export function computeGranularityChangeValue(
  current: Readonly<TemporalCouplingControlsValue>,
  nextGranularity: TemporalCouplingGranularity,
): TemporalCouplingControlsValue {
  if (nextGranularity === current.granularity) return { ...current };
  const next: TemporalCouplingControlsValue = {
    ...current,
    granularity: nextGranularity,
    threshold: GRANULARITY_DEFAULT_THRESHOLD[nextGranularity],
  };
  if (current.directional) {
    next.confidenceThreshold = GRANULARITY_DEFAULT_CONFIDENCE[nextGranularity];
    next.directionalDiff = GRANULARITY_DEFAULT_DIRECTIONAL_DIFF[nextGranularity];
  }
  return next;
}

export function TemporalCouplingControls(props: Readonly<TemporalCouplingControlsProps>): React.ReactElement {
  const vanillaProps: TemporalCouplingControlsVanillaProps = {
    value: props.value,
    onChange: props.onChange,
    resultCount: props.resultCount,
    loading: props.loading,
    showDirectionalControls: props.showDirectionalControls,
    showSubagentGranularity: props.showSubagentGranularity,
    showCombinedGhostEdgeSelector: props.showCombinedGhostEdgeSelector,
  };
  return <VanillaIsland mount={mountTemporalCouplingControls} props={vanillaProps} />;
}
