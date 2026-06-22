import * as React from 'react';
import type { TourStep } from './tourTargets';
import { VanillaIsland } from '../../shared/vanillaIsland';
import {
  mountTourMode,
  type TourModeVanillaProps,
} from '../../views/c4/tourMode';

export type { TourStep };

export interface TourModeProps {
  readonly steps: readonly TourStep[];
  /** Called whenever the focused step changes (BubbleCanvas focusPoint source). */
  readonly onStepChange: (
    target: { readonly file: string; readonly label: string; readonly startLine: number } | null,
  ) => void;
  readonly onClose: () => void;
  readonly isDark: boolean;
  /** Auto-advance interval in ms. */
  readonly autoAdvanceMs?: number;
}

export const TourMode: React.FC<TourModeProps> = (props) => {
  const vanillaProps: TourModeVanillaProps = {
    steps: props.steps,
    onStepChange: props.onStepChange,
    onClose: props.onClose,
    isDark: props.isDark,
    autoAdvanceMs: props.autoAdvanceMs,
  };
  return <VanillaIsland mount={mountTourMode} props={vanillaProps} />;
};
