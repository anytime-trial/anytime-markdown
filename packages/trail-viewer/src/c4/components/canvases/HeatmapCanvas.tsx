/**
 * HeatmapCanvas — thin React wrapper around the vanilla mountHeatmapCanvas factory.
 *
 * All rendering logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/heatmapCanvas.ts
 *
 * HeatmapColorScale and HeatmapCanvasProps are defined in the vanilla module and
 * re-exported here for back-compat.
 */
import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountHeatmapCanvas } from '../../../views/c4/canvases/heatmapCanvas';

export type { HeatmapColorScale, HeatmapCanvasProps } from '../../../views/c4/canvases/heatmapCanvas';
import type { HeatmapCanvasProps } from '../../../views/c4/canvases/heatmapCanvas';

export function HeatmapCanvas(props: Readonly<HeatmapCanvasProps>): React.ReactElement {
  return <VanillaIsland mount={mountHeatmapCanvas} props={props} />;
}
