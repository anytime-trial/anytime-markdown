/**
 * FlowchartCanvas — thin React wrapper around the vanilla mountFlowchartCanvas factory.
 *
 * All rendering logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/flowchartCanvas.ts
 */
import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountFlowchartCanvas } from '../../../views/c4/canvases/flowchartCanvas';
import type { FlowchartCanvasProps } from '../../../views/c4/canvases/flowchartCanvas';

export function FlowchartCanvas(props: Readonly<FlowchartCanvasProps>): React.ReactElement {
  return <VanillaIsland mount={mountFlowchartCanvas} props={props} />;
}
FlowchartCanvas.displayName = 'FlowchartCanvas';
