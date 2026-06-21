import React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import type { TrailMessage } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountTurnLaneChart,
  mountTurnLaneChartLegend,
} from '../../../views/analytics/charts/turnLaneChart';

export function TurnLaneChart(
  props: Readonly<{
    assistantMsgs: readonly TrailMessage[];
    tickStep: number;
    commitTurns?: readonly number[];
    errorTurns?: readonly number[];
    mainAgentLabel: string;
  }>,
) {
  const { colors } = useTrailTheme();
  return <VanillaIsland mount={mountTurnLaneChart} props={{ ...props, colors }} />;
}

export function TurnLaneChartLegend(
  props: Readonly<{ assistantMsgs: readonly TrailMessage[] }>,
) {
  return <VanillaIsland mount={mountTurnLaneChartLegend} props={props} />;
}
