import * as React from 'react';
import type {
  HotspotGranularity,
  TrendPeriod,
} from '@anytime-markdown/trail-core/c4';

import { useTrailI18n } from '../../../i18n/context';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountHotspotControls,
  type HotspotControlsVanillaProps,
} from '../../../views/c4/overlays/hotspotControls';

export interface HotspotControlsValue {
  readonly period: TrendPeriod;
  readonly granularity: HotspotGranularity;
}

export interface HotspotControlsProps {
  readonly value: HotspotControlsValue;
  readonly onChange: (next: HotspotControlsValue) => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly isDark?: boolean;
  /** ポップアップを表示するか。false の場合は何も描画しない（Ghost Edges 設定ポップアップと同じパターン） */
  readonly enabled?: boolean;
  /** Box.sx の上書き（デフォルトの position: 'absolute' を 'static' に変えたい場合など） */
  readonly sx?: Record<string, unknown>;
}

export function HotspotControls(props: Readonly<HotspotControlsProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tStr = (k: string) => t(k as Parameters<typeof t>[0]);
  const vanillaProps: HotspotControlsVanillaProps = {
    value: props.value,
    onChange: props.onChange,
    loading: props.loading,
    disabled: props.disabled,
    isDark: props.isDark,
    enabled: props.enabled,
    labelPeriod: tStr('c4.hotspot.controls.period'),
    labelGranularity: tStr('c4.hotspot.controls.granularity'),
    labelGranularityCommit: tStr('c4.hotspot.controls.granularityCommit'),
    labelGranularitySession: tStr('c4.hotspot.controls.granularitySession'),
  };
  return <VanillaIsland mount={mountHotspotControls} props={vanillaProps} />;
}
