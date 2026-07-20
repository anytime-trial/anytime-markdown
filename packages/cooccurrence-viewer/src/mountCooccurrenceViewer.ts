import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  filterCooccurrenceFile,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type {
  CacheDecision,
  CooccurrenceViewerHandle,
  CooccurrenceViewerOptions,
  CooccurrenceViewerUpdate,
  LayoutStatus,
  RenderGraph,
  RenderNode,
  ViewportState,
} from './types';
import { evaluateLayoutCache } from './layout/cache';
import { startLayoutJob, type LayoutJob } from './layout/runLayout';
import { buildRenderGraph } from './render/buildRenderGraph';
import { graphBounds } from './render/bounds';
import { drawGraph } from './render/drawGraph';
import { readCooccurrenceTheme } from './theme/readTheme';
import { applyCooccurrenceThemeVars } from './theme/applyCooccurrenceThemeVars';
import { fitBounds, pan, zoomAt } from './viewport/viewport';
import { hitTestNode } from './viewport/hitTest';

const STYLE_ID = 'cooccurrence-viewer-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-viewer{position:relative;width:100%;height:100%;min-height:320px;background:var(--cooc-bg);color:var(--cooc-text);overflow:hidden;font-family:system-ui,sans-serif}
.cooc-viewer__canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.cooc-viewer__canvas:active{cursor:grabbing}
.cooc-viewer__toolbar{position:absolute;inset:12px 12px auto auto;display:flex;gap:8px;align-items:center}
.cooc-viewer__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 10px;font:12px system-ui,sans-serif}
.cooc-viewer__button:hover{background:var(--cooc-action-hover)}
.cooc-viewer__status{position:absolute;inset:auto 12px 12px 12px;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif;pointer-events:none}
`;
  document.head.appendChild(style);
}

function cloneWithLayout(file: CooccurrenceFile, positions: Array<[number, number]>, specHash: string): CooccurrenceFile {
  return {
    meta: { ...file.meta },
    spec: {
      ...file.spec,
      nodes: file.spec.nodes.map((node) => ({ ...node })),
      links: file.spec.links.map((link) => [link[0], link[1], link[2]]),
      clusters: file.spec.clusters?.map((cluster) => ({ label: cluster.label, members: [...cluster.members] })),
    },
    layout: { positions, specHash, algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION },
  };
}

function fallbackPositions(file: CooccurrenceFile): Array<[number, number]> {
  return file.spec.nodes.map((_, index) => {
    const angle = (index / Math.max(1, file.spec.nodes.length)) * Math.PI * 2;
    const radius = 180 + Math.sqrt(index) * 28;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function canvasPoint(canvas: HTMLCanvasElement, event: MouseEvent | WheelEvent | PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function updateCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const parent = canvas.parentElement;
  const width = parent?.clientWidth ?? 0;
  const height = parent?.clientHeight ?? 0;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  return { width, height };
}

export function mountCooccurrenceViewer(
  container: HTMLElement,
  initialOptions: CooccurrenceViewerOptions,
): CooccurrenceViewerHandle {
  ensureStyles();
  let options = initialOptions;
  let file = options.file;
  let themeMode = options.themeMode;
  let status: LayoutStatus = 'idle';
  let cacheDecision: CacheDecision = 'miss-absent';
  let layoutRunCount = 0;
  let positions: Array<[number, number]> = file.layout?.positions ?? fallbackPositions(file);
  let graph: RenderGraph = { nodes: [], links: [] };
  let viewport: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 };
  let hoveredNode: RenderNode | null = null;
  let selectedNodeIndex: number | null = null;
  let currentJob: LayoutJob | null = null;
  let destroyed = false;
  let rafId = 0;
  let resizeObserver: ResizeObserver | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number } | null = null;
  let pinchStart: { distance: number; center: { x: number; y: number } } | null = null;
  let fitted = false;

  const root = document.createElement('div');
  root.className = 'cooc-viewer';
  applyCooccurrenceThemeVars(root, themeMode);

  const canvas = document.createElement('canvas');
  canvas.className = 'cooc-viewer__canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', file.spec.title ? `Cooccurrence network: ${file.spec.title}` : 'Cooccurrence network');
  root.appendChild(canvas);

  const toolbar = document.createElement('div');
  toolbar.className = 'cooc-viewer__toolbar';
  root.appendChild(toolbar);
  const statusEl = document.createElement('div');
  statusEl.className = 'cooc-viewer__status';
  root.appendChild(statusEl);
  container.appendChild(root);

  function rebuildGraph(): void {
    const filtered = filterCooccurrenceFile(file, options.filter);
    graph = buildRenderGraph(file, filtered.nodeIndexes, filtered.linkIndexes, positions, root, themeMode);
    statusEl.textContent = `${filtered.counts.visibleNodeCount}/${filtered.counts.totalNodeCount} words, ${filtered.counts.visibleLinkCount}/${filtered.counts.totalLinkCount} cooccurrences, layout: ${status}`;
    if (!fitted) {
      viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
      fitted = true;
    }
  }

  function saveCompletedLayout(): void {
    if (!options.capabilities?.save || !options.onRequestSave || status !== 'done') return;
    options.onRequestSave(cloneWithLayout(file, positions, computeSpecHash(file.spec)));
  }

  function currentPinch(): { distance: number; center: { x: number; y: number } } | null {
    if (pointers.size !== 2) return null;
    const values = [...pointers.values()];
    const a = values[0];
    const b = values[1];
    if (!a || !b) return null;
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  function rebuildToolbar(): void {
    toolbar.replaceChildren();
    const fit = document.createElement('button');
    fit.className = 'cooc-viewer__button';
    fit.type = 'button';
    fit.textContent = 'Fit';
    fit.addEventListener('click', () => {
      viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
    });
    toolbar.appendChild(fit);

    if (status === 'running') {
      const abort = document.createElement('button');
      abort.className = 'cooc-viewer__button';
      abort.type = 'button';
      abort.textContent = 'Abort';
      abort.addEventListener('click', () => {
        currentJob?.abort();
        currentJob = null;
        status = 'aborted';
        rebuildGraph();
        rebuildToolbar();
      });
      toolbar.appendChild(abort);
    }
    if (options.capabilities?.save && options.onRequestSave) {
      const save = document.createElement('button');
      save.className = 'cooc-viewer__button';
      save.type = 'button';
      save.textContent = 'Save';
      save.addEventListener('click', saveCompletedLayout);
      toolbar.appendChild(save);
    }
    if (options.capabilities?.exportPng && options.onExportPng) {
      const png = document.createElement('button');
      png.className = 'cooc-viewer__button';
      png.type = 'button';
      png.textContent = 'PNG';
      png.addEventListener('click', () => {
        canvas.toBlob((blob) => {
          if (blob) options.onExportPng?.(blob);
        }, 'image/png');
      });
      toolbar.appendChild(png);
    }
  }

  function beginLayoutIfNeeded(): void {
    currentJob?.abort();
    currentJob = null;
    const evaluation = evaluateLayoutCache(file);
    cacheDecision = evaluation.decision;
    if (evaluation.decision === 'hit' && file.layout) {
      positions = file.layout.positions.map((pos) => [pos[0], pos[1]]);
      status = 'done';
      rebuildGraph();
      rebuildToolbar();
      return;
    }
    status = 'running';
    layoutRunCount += 1;
    const startHash = evaluation.specHash;
    const job = startLayoutJob(file, startHash, options.createLayoutWorker);
    currentJob = job;
    rebuildGraph();
    rebuildToolbar();
    job.promise.then((result) => {
      if (destroyed || currentJob !== job) return;
      currentJob = null;
      if (computeSpecHash(file.spec) !== result.specHash) return;
      positions = result.positions;
      status = 'done';
      fitted = false;
      rebuildGraph();
      rebuildToolbar();
    }).catch(() => {
      if (destroyed || currentJob !== job) return;
      currentJob = null;
      status = 'aborted';
      rebuildGraph();
      rebuildToolbar();
    });
  }

  function renderLoop(): void {
    if (destroyed) return;
    const size = updateCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGraph({
        ctx,
        width: size.width,
        height: size.height,
        graph,
        viewport,
        theme: readCooccurrenceTheme(root, themeMode),
        selectedNodeIndex,
        hoveredNode,
      });
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    const factor = Math.exp(-event.deltaY * 0.001);
    viewport = zoomAt(viewport, point, factor);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(canvas, event);
    pointers.set(event.pointerId, point);
    dragStart = point;
    pinchStart = currentPinch();
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(canvas, event);
    hoveredNode = hitTestNode(graph, point.x, point.y, viewport);
    const previous = pointers.get(event.pointerId);
    if (previous) {
      pointers.set(event.pointerId, point);
      const pinch = currentPinch();
      if (pinch && pinchStart) {
        viewport = zoomAt(viewport, pinch.center, pinch.distance / pinchStart.distance);
        pinchStart = pinch;
      } else if (pointers.size === 1) {
        viewport = pan(viewport, point.x - previous.x, point.y - previous.y);
      }
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    const point = canvasPoint(canvas, event);
    pointers.delete(event.pointerId);
    pinchStart = currentPinch();
    if (dragStart && Math.hypot(point.x - dragStart.x, point.y - dragStart.y) < 4) {
      const hit = hitTestNode(graph, point.x, point.y, viewport);
      selectedNodeIndex = hit ? (selectedNodeIndex === hit.index ? null : hit.index) : null;
    }
    dragStart = null;
  });
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    pinchStart = currentPinch();
    dragStart = null;
  });
  canvas.addEventListener('keydown', (event) => {
    if (event.key === '0') viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
    if (event.key === '+' || event.key === '=') viewport = zoomAt(viewport, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1.2);
    if (event.key === '-') viewport = zoomAt(viewport, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1 / 1.2);
    if (event.key === 'Escape') selectedNodeIndex = null;
  });

  resizeObserver = new ResizeObserver(() => {
    if (!fitted) viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
  });
  resizeObserver.observe(root);

  rebuildGraph();
  beginLayoutIfNeeded();
  renderLoop();

  return {
    update(partial: CooccurrenceViewerUpdate): void {
      if (partial.themeMode !== undefined) {
        themeMode = partial.themeMode;
        applyCooccurrenceThemeVars(root, themeMode);
      }
      if (partial.capabilities !== undefined) options = { ...options, capabilities: partial.capabilities };
      if (partial.filter !== undefined) {
        options = { ...options, filter: partial.filter };
        fitted = false;
        rebuildGraph();
      }
      if (partial.file !== undefined) {
        file = partial.file;
        options = { ...options, file };
        positions = file.layout?.positions ?? fallbackPositions(file);
        selectedNodeIndex = null;
        hoveredNode = null;
        fitted = false;
        canvas.setAttribute('aria-label', file.spec.title ? `Cooccurrence network: ${file.spec.title}` : 'Cooccurrence network');
        beginLayoutIfNeeded();
      } else {
        rebuildGraph();
      }
      rebuildToolbar();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      currentJob?.abort();
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      root.remove();
    },
    getLayoutStatus: () => status,
    getCacheDecision: () => cacheDecision,
    getLayoutRunCount: () => layoutRunCount,
  };
}
