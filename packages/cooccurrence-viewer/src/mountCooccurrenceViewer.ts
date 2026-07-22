import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  filterCooccurrenceFile,
  type CooccurrenceFile,
  type CooccurrenceFilterCounts,
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
import { LayoutCancelledError, startLayoutJob, type LayoutJob } from './layout/runLayout';
import { buildRenderGraph } from './render/buildRenderGraph';
import { graphBounds } from './render/bounds';
import { createRenderScheduler, type RenderScheduler } from './render/renderScheduler';
import { createCooccurrenceT, type CooccurrenceT } from './i18n/createCooccurrenceT';
import { applyCooccurrenceThemeVars } from './theme/applyCooccurrenceThemeVars';
import { createFilterPanel, type FilterPanelHandle } from './ui/FilterPanel';
import { createWordListPanel, type WordListPanelHandle } from './ui/WordListPanel';
import { fitBounds, pan, zoomAt } from './viewport/viewport';
import { hitTestNode } from './viewport/hitTest';

const STYLE_ID = 'cooccurrence-viewer-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-viewer{position:relative;width:100%;height:100%;min-height:320px;background:var(--cooc-bg);color:var(--cooc-text);overflow:hidden;font-family:system-ui,sans-serif}
.cooc-viewer__main{display:flex;width:100%;height:100%;min-height:0}
.cooc-viewer__stage{position:relative;min-width:0;min-height:0;flex:1}
.cooc-viewer__canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.cooc-viewer__canvas:active{cursor:grabbing}
.cooc-viewer__panels{width:300px;min-width:240px;max-width:40%;height:100%;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--cooc-divider);background:var(--cooc-bg);overflow-y:auto;overflow-x:hidden}
.cooc-viewer__panels[hidden]{display:none}
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
  let t: CooccurrenceT = createCooccurrenceT('Cooccurrence', options.locale);
  let status: LayoutStatus = 'idle';
  let cacheDecision: CacheDecision = 'miss-absent';
  let layoutRunCount = 0;
  let positions: Array<[number, number]> = file.layout?.positions ?? fallbackPositions(file);
  let graph: RenderGraph = { nodes: [], links: [] };
  let viewport: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 };
  let hoveredNode: RenderNode | null = null;
  let selectedNodeIndex: number | null = null;
  let showPanels = options.showPanels ?? true;
  let currentJob: LayoutJob | null = null;
  let destroyed = false;
  let scheduler: RenderScheduler | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number } | null = null;
  let pinchStart: { distance: number; center: { x: number; y: number } } | null = null;
  let fitted = false;

  const root = document.createElement('div');
  root.className = 'cooc-viewer';
  applyCooccurrenceThemeVars(root, themeMode);

  const main = document.createElement('div');
  main.className = 'cooc-viewer__main';
  root.appendChild(main);
  const stage = document.createElement('div');
  stage.className = 'cooc-viewer__stage';
  main.appendChild(stage);
  const canvas = document.createElement('canvas');
  canvas.className = 'cooc-viewer__canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', canvasLabel());
  stage.appendChild(canvas);

  const panelRoot = document.createElement('aside');
  panelRoot.className = 'cooc-viewer__panels';
  panelRoot.hidden = !showPanels;
  main.appendChild(panelRoot);

  // ツールバーと状態表示は絶対配置のため、root 直下に置くとパネル列の上にも重なり、
  // パネル先頭の見出しや入力欄を覆って操作できなくなる。stage を含有ブロックにして
  // キャンバス領域の中だけに閉じ込める。
  const toolbar = document.createElement('div');
  toolbar.className = 'cooc-viewer__toolbar';
  stage.appendChild(toolbar);
  const statusEl = document.createElement('div');
  statusEl.className = 'cooc-viewer__status';
  stage.appendChild(statusEl);
  container.appendChild(root);

  let filterCounts: CooccurrenceFilterCounts = {
    visibleNodeCount: 0,
    visibleLinkCount: 0,
    totalNodeCount: file.spec.nodes.length,
    totalLinkCount: file.spec.links.length,
  };
  let visibleNodeIndexes: ReadonlySet<number> = new Set();
  let filterPanel: FilterPanelHandle | null = null;
  let wordListPanel: WordListPanelHandle | null = null;

  function canvasLabel(): string {
    return file.spec.title ? t('canvas.labelWithTitle', { title: file.spec.title }) : t('canvas.label');
  }

  function layoutStatusLabel(): string {
    switch (status) {
      case 'idle':
        return t('layoutStatus.idle');
      case 'running':
        return t('layoutStatus.running');
      case 'done':
        return t('layoutStatus.done');
      case 'aborted':
        return t('layoutStatus.aborted');
      case 'failed':
        return t('layoutStatus.failed');
    }
  }

  function syncCanvasLabel(): void {
    canvas.setAttribute('aria-label', canvasLabel());
  }

  function updatePanels(): void {
    if (!showPanels) return;
    const filterState = { file, filter: options.filter, counts: filterCounts, t };
    const wordsState = { file, visibleNodeIndexes, selectedNodeIndex, t };
    filterPanel?.update(filterState);
    wordListPanel?.update(wordsState);
  }

  function applyFileChange(nextFile: CooccurrenceFile, notifyHost: boolean): void {
    file = nextFile;
    options = { ...options, file };
    positions = file.layout?.positions ?? fallbackPositions(file);
    selectedNodeIndex = null;
    hoveredNode = null;
    fitted = false;
    syncCanvasLabel();
    if (notifyHost) options.onFileChange?.(file);
    beginLayoutIfNeeded();
  }

  function ensurePanels(): void {
    if (filterPanel && wordListPanel) return;
    filterPanel = createFilterPanel({
      file,
      filter: options.filter,
      counts: filterCounts,
      t,
      onFilterChange(nextFilter) {
        options = { ...options, filter: nextFilter };
        fitted = false;
        rebuildGraph();
        updatePanels();
      },
    });
    wordListPanel = createWordListPanel({
      file,
      visibleNodeIndexes,
      selectedNodeIndex,
      t,
      onSelectNode(nodeIndex) {
        selectedNodeIndex = nodeIndex;
        updatePanels();
      },
      onFileChange: (nextFile) => applyFileChange(nextFile, true),
    });
    panelRoot.append(filterPanel.element, wordListPanel.element);
  }

  function syncPanelVisibility(): void {
    panelRoot.hidden = !showPanels;
    if (showPanels) {
      ensurePanels();
      updatePanels();
    }
  }

  function rebuildGraph(): void {
    const filtered = filterCooccurrenceFile(file, options.filter);
    filterCounts = filtered.counts;
    visibleNodeIndexes = filtered.nodeIndexes;
    graph = buildRenderGraph(file, filtered.nodeIndexes, filtered.linkIndexes, positions, root, themeMode);
    statusEl.textContent = t('status.summary', {
      visibleWords: filtered.counts.visibleNodeCount,
      totalWords: filtered.counts.totalNodeCount,
      visibleCooccurrences: filtered.counts.visibleLinkCount,
      totalCooccurrences: filtered.counts.totalLinkCount,
      layoutStatus: layoutStatusLabel(),
    });
    if (!fitted) {
      viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
      fitted = true;
    }
    scheduler?.invalidate();
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
    fit.textContent = t('toolbar.fit');
    fit.addEventListener('click', () => {
      viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
    });
    toolbar.appendChild(fit);

    const panels = document.createElement('button');
    panels.className = 'cooc-viewer__button';
    panels.type = 'button';
    panels.textContent = showPanels ? t('toolbar.hidePanels') : t('toolbar.showPanels');
    panels.addEventListener('click', () => {
      showPanels = !showPanels;
      syncPanelVisibility();
      rebuildToolbar();
    });
    toolbar.appendChild(panels);

    if (status === 'running') {
      const abort = document.createElement('button');
      abort.className = 'cooc-viewer__button';
      abort.type = 'button';
      abort.textContent = t('toolbar.abort');
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
      save.textContent = t('toolbar.save');
      save.addEventListener('click', saveCompletedLayout);
      toolbar.appendChild(save);
    }
    if (options.capabilities?.exportPng && options.onExportPng) {
      const png = document.createElement('button');
      png.className = 'cooc-viewer__button';
      png.type = 'button';
      png.textContent = t('toolbar.exportPng');
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
    }).catch((error: unknown) => {
      if (destroyed || currentJob !== job) return;
      currentJob = null;
      const cancelled = error instanceof LayoutCancelledError;
      if (!cancelled) {
        // 理由を捨てない。捨てると Worker のクラッシュが「中断しました」と同じ見た目になり、
        // 利用者にも開発者にも原因が残らない。
        console.error('[cooccurrence-viewer] layout job failed.', error);
      }
      status = cancelled ? 'aborted' : 'failed';
      rebuildGraph();
      rebuildToolbar();
    });
  }



  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    const factor = Math.exp(-event.deltaY * 0.001);
    viewport = zoomAt(viewport, point, factor);
    scheduler?.invalidate();
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
    const previousHover = hoveredNode;
    hoveredNode = hitTestNode(graph, point.x, point.y, viewport);
    if (previousHover !== hoveredNode) scheduler?.invalidate();
    const previous = pointers.get(event.pointerId);
    if (previous) {
      pointers.set(event.pointerId, point);
      const pinch = currentPinch();
      if (pinch && pinchStart) {
        viewport = zoomAt(viewport, pinch.center, pinch.distance / pinchStart.distance);
        scheduler?.invalidate();
        pinchStart = pinch;
      } else if (pointers.size === 1) {
        viewport = pan(viewport, point.x - previous.x, point.y - previous.y);
        scheduler?.invalidate();
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
      scheduler?.invalidate();
      updatePanels();
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
    scheduler?.invalidate();
    updatePanels();
  });

  resizeObserver = new ResizeObserver(() => {
    if (!fitted) viewport = fitBounds(graphBounds(graph), updateCanvasSize(canvas));
    // 寸法が変わると canvas のバッキングストアを取り直す必要がある。
    scheduler?.invalidate();
  });
  resizeObserver.observe(root);

  rebuildGraph();
  syncPanelVisibility();
  beginLayoutIfNeeded();
  scheduler = createRenderScheduler({
    canvas,
    themeHost: root,
    getState: () => ({ graph, viewport, selectedNodeIndex, hoveredNode, themeMode }),
  });
  scheduler.invalidate();

  return {
    update(partial: CooccurrenceViewerUpdate): void {
      if (partial.themeMode !== undefined) {
        themeMode = partial.themeMode;
        applyCooccurrenceThemeVars(root, themeMode);
        scheduler?.invalidateTheme();
      }
      if (partial.locale !== undefined) {
        options = { ...options, locale: partial.locale };
        t = createCooccurrenceT('Cooccurrence', partial.locale);
        syncCanvasLabel();
      }
      if (partial.capabilities !== undefined) options = { ...options, capabilities: partial.capabilities };
      if (partial.showPanels !== undefined) {
        showPanels = partial.showPanels;
        options = { ...options, showPanels };
        syncPanelVisibility();
      }
      if (partial.filter !== undefined) {
        options = { ...options, filter: partial.filter };
        fitted = false;
        rebuildGraph();
        updatePanels();
      }
      if (partial.file !== undefined) {
        applyFileChange(partial.file, false);
      } else {
        rebuildGraph();
      }
      updatePanels();
      rebuildToolbar();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      currentJob?.abort();
      scheduler?.stop();
      resizeObserver?.disconnect();
      filterPanel?.destroy();
      wordListPanel?.destroy();
      root.remove();
    },
    getLayoutStatus: () => status,
    getCacheDecision: () => cacheDecision,
    getLayoutRunCount: () => layoutRunCount,
    getRenderFrameCount: () => scheduler?.getFrameCount() ?? 0,
    getFilterCounts: () => filterCounts,
  };
}
