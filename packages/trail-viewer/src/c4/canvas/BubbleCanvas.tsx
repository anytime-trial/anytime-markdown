/**
 * BubbleCanvas — thin React wrapper around the vanilla mountBubbleCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvas/bubbleCanvas.ts
 */
import type React from 'react';
import { useTrailTheme } from '../../components/TrailThemeContext';
import { VanillaIsland } from '../../shared/vanillaIsland';
import type { BubbleCanvasViewProps } from '../../views/c4/canvas/bubbleCanvas';
import { mountBubbleCanvas } from '../../views/c4/canvas/bubbleCanvas';

// Re-export types that external consumers (FunctionScatterPlot etc.) import from this path.
export type { BubblePoint, BubbleCanvasProps } from '../../views/c4/canvas/bubbleCanvas';

export function BubbleCanvas({
  points,
  onPointClick,
  height = 400,
  focusPoint = null,
}: Readonly<BubbleCanvasViewProps>): React.ReactElement {
  const { isDark } = useTrailTheme();

  const vanillaProps: BubbleCanvasViewProps = {
    points,
    onPointClick,
    height,
    focusPoint,
    isDark,
  };

  return <VanillaIsland mount={mountBubbleCanvas} props={vanillaProps} />;
}
