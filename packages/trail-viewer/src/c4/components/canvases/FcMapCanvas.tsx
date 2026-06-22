/**
 * FcMapCanvas — thin React wrapper around the vanilla mountFcMapCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/fcMapCanvas.ts
 */
import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountFcMapCanvas } from '../../../views/c4/canvases/fcMapCanvas';
import type { FcMapCanvasProps } from '../../../views/c4/canvases/fcMapCanvas';

export function FcMapCanvas(props: Readonly<FcMapCanvasProps>): React.ReactElement {
  return <VanillaIsland mount={mountFcMapCanvas} props={props} />;
}
