/**
 * mountScatterPanel — composed Function Scatter view (vanilla DOM).
 *
 * Wraps the toolbar (mountFunctionScatterPlotPanel) and the plot canvas
 * (bubble / galaxy / city) plus the optional tour overlay into a single
 * controlled handle. The consumer (c4Viewer) owns `view` / `tourActive` state
 * and feeds them via props, mirroring the Matrix panel pattern:
 *   - view change   → remount the canvas (a different canvas factory)
 *   - other changes → update the mounted canvas in place (canvases re-render
 *                     their data on update(), unlike the spreadsheet grid)
 *
 * Vanilla port of the React FunctionScatterPlot.tsx composition.
 */
import {
  mountFunctionScatterPlotPanel,
  type FunctionScatterPlotPanelColors,
  type FunctionScatterPlotPanelProps,
} from './functionScatterPlotPanel';
import { mountBubbleCanvas } from '../canvas/bubbleCanvas';
import { mountGalaxyCanvas } from '../canvas/galaxyCanvas';
import { mountCodeCityCanvas } from '../canvas/codeCityCanvas';
import { mountTourMode } from '../tourMode';
import { selectTourTargets, type TourStep } from '../../../c4/canvas/tourTargets';
import { toBubblePoints } from '../../../c4/components/panels/FunctionScatterPlot';
import type { FunctionAnalysisApiEntry } from '../../../c4/hooks/fetchFunctionAnalysisApi';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

type ViewMode = 'scatter' | 'galaxy' | 'city';
type FocusPoint = { readonly file: string; readonly label: string; readonly startLine: number } | null;

export interface ScatterPanelProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly view: ViewMode;
  readonly tourActive: boolean;
  readonly isDark: boolean;
  readonly onViewChange: (view: ViewMode) => void;
  readonly onTourToggle: () => void;
  /** trail-viewer の onOpenFile は filePath 単一引数のため line 情報は渡せない。 */
  readonly onFunctionOpen?: (filePath: string) => void;
  readonly colors: FunctionScatterPlotPanelColors;
  readonly t: (key: string) => string;
}

export function mountScatterPanel(
  container: HTMLElement,
  initial: ScatterPanelProps,
): VanillaViewHandle<ScatterPanelProps> {
  let props = initial;
  let tourSteps: TourStep[] = selectTourTargets(props.entries);
  // Ephemeral tour focus; only meaningful while the bubble canvas is mounted.
  let tourTarget: FocusPoint = null;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';
  container.appendChild(root);

  // ── Toolbar ──
  const toolbarHost = document.createElement('div');
  toolbarHost.style.cssText = 'flex-shrink:0;';
  root.appendChild(toolbarHost);
  const toolbarHandle = mountFunctionScatterPlotPanel(toolbarHost, buildToolbarProps());

  // ── Canvas area (tour overlay positions against this) ──
  const canvasArea = document.createElement('div');
  canvasArea.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;position:relative;';
  root.appendChild(canvasArea);

  let mountedView: ViewMode | null = null;
  let canvasDestroy: (() => void) | null = null;
  let canvasUpdate: (() => void) | null = null;
  let tourHandle: VanillaViewHandle<unknown> | null = null;

  function buildToolbarProps(): FunctionScatterPlotPanelProps {
    return {
      view: props.view,
      tourActive: props.tourActive,
      tourStepsCount: tourSteps.length,
      onViewChange: props.onViewChange,
      onTourToggle: props.onTourToggle,
      colors: props.colors,
      t: props.t,
    };
  }

  function openFile(filePath: string): void {
    props.onFunctionOpen?.(filePath);
  }

  function mountCanvasFor(view: ViewMode): void {
    if (view === 'scatter') {
      const h = mountBubbleCanvas(canvasArea, {
        points: toBubblePoints(props.entries),
        height: '100%',
        isDark: props.isDark,
        focusPoint: props.tourActive ? tourTarget : null,
        onPointClick: (pt) => openFile(pt.file),
      });
      canvasDestroy = () => h.destroy();
      canvasUpdate = () => h.update({
        points: toBubblePoints(props.entries),
        height: '100%',
        isDark: props.isDark,
        focusPoint: props.tourActive ? tourTarget : null,
        onPointClick: (pt) => openFile(pt.file),
      });
      return;
    }
    const mount = view === 'galaxy' ? mountGalaxyCanvas : mountCodeCityCanvas;
    const h = mount(canvasArea, {
      entries: props.entries,
      height: '100%',
      isDark: props.isDark,
      onFunctionOpen: (filePath) => openFile(filePath),
    });
    canvasDestroy = () => h.destroy();
    canvasUpdate = () => h.update({
      entries: props.entries,
      height: '100%',
      isDark: props.isDark,
      onFunctionOpen: (filePath) => openFile(filePath),
    });
  }

  function renderCanvas(): void {
    if (mountedView !== props.view) {
      canvasDestroy?.();
      mountCanvasFor(props.view);
      mountedView = props.view;
    } else {
      canvasUpdate?.();
    }
  }

  function renderTour(): void {
    const show = props.tourActive && props.view === 'scatter' && tourSteps.length > 0;
    if (show && !tourHandle) {
      tourHandle = mountTourMode(canvasArea, {
        steps: tourSteps,
        isDark: props.isDark,
        onStepChange: (target) => { tourTarget = target; canvasUpdate?.(); },
        onClose: () => props.onTourToggle(),
      });
    } else if (!show && tourHandle) {
      tourHandle.destroy();
      tourHandle = null;
      tourTarget = null;
    } else if (show && tourHandle) {
      tourHandle.update({
        steps: tourSteps,
        isDark: props.isDark,
        onStepChange: (target: FocusPoint) => { tourTarget = target; canvasUpdate?.(); },
        onClose: () => props.onTourToggle(),
      });
    }
  }

  renderCanvas();
  renderTour();

  return {
    update(next) {
      const entriesChanged = next.entries !== props.entries;
      props = next;
      if (entriesChanged) tourSteps = selectTourTargets(props.entries);
      toolbarHandle.update(buildToolbarProps());
      renderCanvas();
      renderTour();
    },
    destroy() {
      tourHandle?.destroy();
      tourHandle = null;
      canvasDestroy?.();
      canvasDestroy = null;
      canvasUpdate = null;
      toolbarHandle.destroy();
      root.remove();
    },
  };
}
