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
import { updateCanvasSize } from './render/canvasSize';
import { createRenderScheduler, type RenderScheduler } from './render/renderScheduler';
import { createCooccurrenceT, type CooccurrenceT } from './i18n/createCooccurrenceT';
import { applyCooccurrenceThemeVars } from './theme/applyCooccurrenceThemeVars';
import { createFilterPanel, type FilterPanelHandle } from './ui/FilterPanel';
import { createWordListPanel, type WordListPanelHandle } from './ui/WordListPanel';
import { createMinimapPanel, type MinimapPanelHandle } from './ui/MinimapPanel';
import { createExportPanel, type ExportPanelHandle, type ExportPanelState } from './ui/ExportPanel';
import {
  createSideIconRail,
  type SideIconRailHandle,
  type SideIconRailItem,
  type SideIconRailState,
} from './ui/SideIconRail';
import {
  COOC_TAB_IDS,
  panelStateAfterSelect,
  tabElementId,
  tabPanelElementId,
  type CooccurrenceTabId,
} from './ui/tabModel';
import { zoomViewportCenter } from './ui/minimapModel';
import { ensureButtonBaseStyles } from './ui/buttonBaseStyle';
import { fitBounds, pan, zoomAt } from './viewport/viewport';
import { hitTestNode } from './viewport/hitTest';

const STYLE_ID = 'cooccurrence-viewer-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
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
.cooc-viewer__tabpanel{flex:1 1 0;display:flex;flex-direction:column}
.cooc-viewer__tabpanel[hidden]{display:none}
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
  let minimapPanel: MinimapPanelHandle | null = null;
  let exportPanel: ExportPanelHandle | null = null;
  // 既定はミニマップ（仕様 §3.5）。図を開いた直後に必要なのは全体の把握である。
  let activeTab: CooccurrenceTabId = 'minimap';

  // タブの内容は隠す側も DOM に残す。破棄すると絞り込みの入力値と、入力中のフォーカス復帰
  // （FilterPanel が activeElement を見て行う）が切り替えのたびに失われる。
  function createTabPanel(id: CooccurrenceTabId): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'cooc-viewer__tabpanel';
    element.id = tabPanelElementId(id);
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', tabElementId(element.id));
    return element;
  }

  const filterTabPanel = createTabPanel('filter');
  const editTabPanel = createTabPanel('edit');
  const minimapTabPanel = createTabPanel('minimap');
  const exportTabPanel = createTabPanel('export');

  /**
   * 図の右端のアイコン列。パネルの中身と違って畳んでいる間も残す。
   *
   * 図の上に開閉ボタンを置かない代わりに、ここが唯一の開閉の入口になる（仕様 §3.5）。
   * 列まで消すと、畳んだ状態からパネルへ戻る手段が無くなる。
   */
  const rail: SideIconRailHandle = createSideIconRail({
    ...railState(),
    onSelect(id) {
      const next = panelStateAfterSelect({ activeId: activeTab, expanded: showPanels }, id);
      activeTab = next.activeId;
      showPanels = next.expanded;
      options = { ...options, showPanels };
      syncPanelVisibility();
    },
  });
  main.appendChild(rail.element);

  /**
   * 今そこにあるタブ。保存も PNG も提供しないホストでは保存タブを出さない（仕様 §3.5・§6.3）。
   * タブ列・矢印キーの巡回・表示の切り替えは、いずれもこの並びを唯一の根拠にする。
   */
  function displayedTabIds(): readonly CooccurrenceTabId[] {
    return COOC_TAB_IDS.filter((id) => id !== 'export' || canExport());
  }

  function canSave(): boolean {
    return options.capabilities?.save === true && options.onRequestSave !== undefined;
  }

  function canExportPng(): boolean {
    return options.capabilities?.exportPng === true && options.onExportPng !== undefined;
  }

  function canExport(): boolean {
    return canSave() || canExportPng();
  }

  /**
   * 保存タブへ渡す状態。
   *
   * capability とコールバックの両方を見た結果だけを渡す。パネル側で判定させると、
   * `capabilities.save` は true だが `onRequestSave` が無いホストで、押しても
   * 何も起きないボタンが出る。
   */
  function exportPanelState(): ExportPanelState {
    return { canSave: canSave(), canExportPng: canExportPng(), layoutStatus: status, t };
  }

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
    syncExportPanel();
    minimapPanel?.setT(t);
    minimapPanel?.refresh();
    exportPanel?.update(exportPanelState());
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
    minimapPanel = createMinimapPanel({
      themeHost: root,
      t,
      getState: () => ({ graph, viewport, canvasSize: canvasDisplaySize(), themeMode }),
      onViewportChange: setViewport,
      onZoom(factor) {
        setViewport(zoomViewportCenter(viewport, canvasDisplaySize(), factor));
      },
      onFitContent: fitToGraph,
    });
    filterTabPanel.appendChild(filterPanel.element);
    editTabPanel.appendChild(wordListPanel.element);
    minimapTabPanel.appendChild(minimapPanel.element);
    // tabpanel の DOM 順もアイコンの並びに合わせる。見た目には 1 枚しか出ないが、
    // 支援技術の読み上げ順と Tab キーの移動順はこの順序に従う。
    panelRoot.append(minimapTabPanel, filterTabPanel, editTabPanel);
    syncExportPanel();
    syncActiveTab();
  }

  /**
   * 保存タブを capability に合わせて出し入れする。
   *
   * ホストは `update({ capabilities })` で後から対応状況を変えられる。作るだけにすると、
   * 対応が外れた後も保存タブが残り、押しても何も起きないボタンが並ぶ。
   */
  function syncExportPanel(): void {
    if (canExport() === (exportPanel !== null)) return;
    if (exportPanel) {
      exportPanel.destroy();
      exportPanel = null;
      exportTabPanel.remove();
      return;
    }
    exportPanel = createExportPanel({
      ...exportPanelState(),
      onRequestSave: saveCompletedLayout,
      onExportPng: exportPng,
    });
    exportTabPanel.appendChild(exportPanel.element);
    panelRoot.appendChild(exportTabPanel);
  }

  /**
   * タブ 1 枚ぶんの見出し。
   *
   * Why not キーを表引きにまとめるか: 辞書の使用状況は `t(キー)` の直書きを走査して
   * 検査している（`i18n.test.ts`）。変数越しに引くと走査から外れ、使われているキーが
   * 「参照ゼロ」と判定される。
   */
  function tabItem(id: CooccurrenceTabId): SideIconRailItem {
    switch (id) {
      case 'filter':
        return { id, label: t('tabs.filter'), panelId: filterTabPanel.id };
      case 'edit':
        return { id, label: t('tabs.edit'), panelId: editTabPanel.id };
      case 'minimap':
        return { id, label: t('tabs.minimap'), panelId: minimapTabPanel.id };
      case 'export':
        return { id, label: t('tabs.export'), panelId: exportTabPanel.id };
    }
  }

  function tabItems(): readonly SideIconRailItem[] {
    return displayedTabIds().map(tabItem);
  }

  /** アイコン列へ流し込む状態。選択中のタブと、パネルを開いているかを一緒に渡す。 */
  function railState(): SideIconRailState {
    return { items: tabItems(), activeId: activeTab, expanded: showPanels, listLabel: t('tabs.listLabel') };
  }

  /**
   * 選択中のタブを画面へ反映する。
   *
   * 語一覧は隠れている間 viewport の高さが 0 になり、可視ウィンドウがフォールバックの
   * 120px 相当（数行）で固まる。表示へ戻すだけでは状態が変わらず再描画も走らないため、
   * ここで作り直す。
   */
  function syncActiveTab(): void {
    const displayed = displayedTabIds();
    // 選択中のタブが capability の変化で消えることがある。放置すると、どのタブも
    // 選ばれていない（内容が何も出ない）状態が残る。
    if (!displayed.includes(activeTab)) activeTab = displayed[0] ?? 'minimap';
    filterTabPanel.hidden = activeTab !== 'filter';
    editTabPanel.hidden = activeTab !== 'edit';
    minimapTabPanel.hidden = activeTab !== 'minimap';
    exportTabPanel.hidden = activeTab !== 'export';
    rail.update(railState());
    // 畳んでいる間の作り直しは意味を持たない。列の高さが 0 のまま組むと、仮想リストの
    // 可視ウィンドウが 0 行で確定し、開き直しても空のまま残る。
    if (!showPanels) return;
    if (activeTab === 'edit') wordListPanel?.refresh();
    if (activeTab === 'minimap') minimapPanel?.refresh();
  }

  /**
   * パネルの開閉を画面へ反映する。
   *
   * 畳んだ場合もアイコン列は更新する（選択中の見た目を落とすため）。中身の更新は開いている
   * ときだけ行う。
   */
  function syncPanelVisibility(): void {
    panelRoot.hidden = !showPanels;
    if (showPanels) {
      ensurePanels();
      updatePanels();
    }
    syncActiveTab();
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
      fitToGraph();
      fitted = true;
    }
    scheduler?.invalidate();
  }

  function saveCompletedLayout(): void {
    if (!options.capabilities?.save || !options.onRequestSave || status !== 'done') return;
    options.onRequestSave(cloneWithLayout(file, positions, computeSpecHash(file.spec)));
  }

  /**
   * viewport を差し替える唯一の入口。
   *
   * Why not 各ハンドラで `viewport = ...` と代入するか: 描画は要求時のみ行うため、
   * 更新と `invalidate()` が分かれていると片方だけ書き忘れる。実際に全体表示ボタンだけ
   * 要求が抜け、画面が空のまま次の操作まで戻らなかった。
   */
  function setViewport(next: ViewportState): void {
    viewport = next;
    scheduler?.invalidate();
    // ミニマップの枠は視野そのものを映す。ここで要求しないと、図だけが動いて枠が取り残される。
    minimapPanel?.refresh();
  }

  /** 図の canvas の表示サイズ（CSS ピクセル）。バッキングストアには触れない。 */
  function canvasDisplaySize(): { width: number; height: number } {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  /**
   * グラフ全体が収まるよう viewport を合わせる。
   *
   * `updateCanvasSize()` は `canvas.width` へ代入するため、同じ値でも canvas の内容が消える。
   * 再描画要求を伴わないと画面が空のまま残る。
   */
  function fitToGraph(): void {
    setViewport(fitBounds(graphBounds(graph), updateCanvasSize(canvas)));
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

  /**
   * レイアウトの状態に連動する表示をまとめて合わせる。
   *
   * 図の上に置くボタンは計算中の中断だけに絞る（仕様 §3.5）。全体表示・保存・PNG は右パネルの
   * タブへ、パネルの開閉は右端のアイコン列へ移した。図の上のボタンは常に図そのものを覆うため、
   * そこへ置いてよいのは、図を広く使っている最中にしか起きない操作に限る。
   *
   * Why not ツールバーだけを組み直すか: 保存できるかどうかも同じ状態で決まる
   * （反復を完了した計算だけが保存対象。仕様 §4.2）。別々に更新すると、状態が
   * 変わった箇所のどちらか一方だけが更新されずに残る。
   */
  function syncStatusUi(): void {
    exportPanel?.update(exportPanelState());
    toolbar.replaceChildren();

    if (status === 'running') {
      const abort = document.createElement('button');
      abort.className = 'cooc-btn cooc-viewer__button';
      abort.type = 'button';
      abort.textContent = t('toolbar.abort');
      abort.addEventListener('click', () => {
        currentJob?.abort();
        currentJob = null;
        status = 'aborted';
        rebuildGraph();
        syncStatusUi();
      });
      toolbar.appendChild(abort);
    }
  }

  function exportPng(): void {
    canvas.toBlob((blob) => {
      if (blob) options.onExportPng?.(blob);
    }, 'image/png');
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
      syncStatusUi();
      return;
    }
    status = 'running';
    layoutRunCount += 1;
    const startHash = evaluation.specHash;
    const job = startLayoutJob(file, startHash, options.createLayoutWorker);
    currentJob = job;
    rebuildGraph();
    syncStatusUi();
    job.promise.then((result) => {
      if (destroyed || currentJob !== job) return;
      currentJob = null;
      if (computeSpecHash(file.spec) !== result.specHash) return;
      positions = result.positions;
      status = 'done';
      fitted = false;
      rebuildGraph();
      syncStatusUi();
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
      syncStatusUi();
    });
  }



  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    const factor = Math.exp(-event.deltaY * 0.001);
    setViewport(zoomAt(viewport, point, factor));
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
        setViewport(zoomAt(viewport, pinch.center, pinch.distance / pinchStart.distance));
        pinchStart = pinch;
      } else if (pointers.size === 1) {
        setViewport(pan(viewport, point.x - previous.x, point.y - previous.y));
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
    if (event.key === '0') fitToGraph();
    if (event.key === '+' || event.key === '=') setViewport(zoomAt(viewport, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1.2));
    if (event.key === '-') setViewport(zoomAt(viewport, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1 / 1.2));
    if (event.key === 'Escape') selectedNodeIndex = null;
    scheduler?.invalidate();
    updatePanels();
  });

  resizeObserver = new ResizeObserver(() => {
    if (!fitted) fitToGraph();
    // 寸法が変わると canvas のバッキングストアを取り直す必要がある。
    scheduler?.invalidate();
    // ミニマップも同様。枠は図の canvas の寸法から計算するため（`visibleRect`）、視野が
    // 動かなくても描き直しが要る。ミニマップ自身の幅もパネル列の幅に追従して変わる。
    minimapPanel?.refresh();
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
        // タブ見出しはパネルの update を経由しないため、ここで訳し直さないと旧言語で残る。
        syncActiveTab();
      }
      if (partial.capabilities !== undefined) {
        options = { ...options, capabilities: partial.capabilities };
        // 保存タブの有無が変わる。タブ列と選択状態をこの時点で合わせておかないと、
        // 消えたタブが選ばれたまま内容だけが空になる。
        syncExportPanel();
        syncActiveTab();
      }
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
      syncStatusUi();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      currentJob?.abort();
      scheduler?.stop();
      resizeObserver?.disconnect();
      filterPanel?.destroy();
      wordListPanel?.destroy();
      minimapPanel?.destroy();
      exportPanel?.destroy();
      root.remove();
    },
    getLayoutStatus: () => status,
    getCacheDecision: () => cacheDecision,
    getLayoutRunCount: () => layoutRunCount,
    getRenderFrameCount: () => scheduler?.getFrameCount() ?? 0,
    getFilterCounts: () => filterCounts,
    getMinimapDrawCount: () => minimapPanel?.getDrawCount() ?? 0,
  };
}
