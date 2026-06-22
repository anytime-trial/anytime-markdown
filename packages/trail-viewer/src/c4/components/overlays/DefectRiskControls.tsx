import * as React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { useTrailI18n } from '../../../i18n/context';
import {
  mountDefectRiskControls,
  type DefectRiskControlsVanillaProps,
} from '../../../views/c4/overlays/defectRiskControls';

export interface DefectRiskControlsValue {
  enabled: boolean;
  windowDays: number;
  halfLifeDays: number;
}

export interface DefectRiskControlsProps {
  readonly value: DefectRiskControlsValue;
  readonly onChange: (next: DefectRiskControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
}

const WINDOW_OPTIONS_LOCAL = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: 'All', days: 365 },
] as const;

export function computeDefectRiskWindowLabel(days: number): string {
  return WINDOW_OPTIONS_LOCAL.find((o) => o.days === days)?.label ?? `${days}d`;
}

export const DEFAULT_DEFECT_RISK_VALUE: DefectRiskControlsValue = {
  enabled: false,
  windowDays: 90,
  halfLifeDays: 90,
};

export function DefectRiskControls(props: Readonly<DefectRiskControlsProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tStr = (k: string) => t(k as Parameters<typeof t>[0]);
  const vanillaProps: DefectRiskControlsVanillaProps = {
    ...props,
    labelWindow: '期間',
    labelHalfLife: '半減期',
    labelCalculating: tStr('c4.defectRisk.calculating') !== 'c4.defectRisk.calculating'
      ? tStr('c4.defectRisk.calculating')
      : '計算中...',
    labelOff: 'OFF',
  };
  return <VanillaIsland mount={mountDefectRiskControls} props={vanillaProps} />;
}
