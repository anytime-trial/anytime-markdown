import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  cooccurrenceSliceCount,
  filterCooccurrenceFile,
  readLink,
  writeLink,
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
  RenderLink,
  RenderNode,
  TimelineLayerState,
  TimelineViewState,
  ViewportState,
} from './types';
import { evaluateLayoutCache } from './layout/cache';
import { LayoutCancelledError, startLayoutJob, type LayoutJob } from './layout/runLayout';
import { buildRenderGraph, type RenderLayerInput } from './render/buildRenderGraph';
import { computeLayerPlacements, unionBounds } from './render/layerLayout';
import { RADIUS_MAX } from './render/scales';
import { defaultTimelineViewState, visibleSliceIndexes } from './ui/timelineModel';
import { graphBounds } from './render/bounds';
import { updateCanvasSize } from './render/canvasSize';
import { createRenderScheduler, type RenderScheduler } from './render/renderScheduler';
import { createCooccurrenceT, type CooccurrenceT } from './i18n/createCooccurrenceT';
import { applyCooccurrenceThemeVars } from './theme/applyCooccurrenceThemeVars';
import { createFilterPanel, type FilterPanelHandle } from './ui/FilterPanel';
import { createWordListPanel, type WordListPanelHandle } from './ui/WordListPanel';
import { createLinkListPanel, type LinkListPanelHandle } from './ui/LinkListPanel';
import { createMinimapPanel, type MinimapPanelHandle } from './ui/MinimapPanel';
import { createExportPanel, type ExportPanelHandle, type ExportPanelState } from './ui/ExportPanel';
import { createClusterListPanel, type ClusterListPanelHandle } from './ui/ClusterListPanel';
import { createTimelinePanel, type TimelinePanelHandle } from './ui/TimelinePanel';
import { createNotePopup, type NotePopupHandle } from './ui/NotePopup';
import {
  clusterPopupState,
  linkPopupState,
  nodePopupState,
  type LinkPopupLayerContext,
  type NodePopupLayerContext,
} from './ui/notePopupModel';
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
import { hitTestLink, hitTestNode } from './viewport/hitTest';

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
      // writeLink を通す。添字で組み直すと、レイアウト完了後のファイル差し替えで向きが落ちる。
      links: file.spec.links.map((link) => writeLink(readLink(link))),
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
  let graph: RenderGraph = { nodes: [], links: [], timeLinks: [], layers: [] };
  let timelineView: TimelineViewState = defaultTimelineViewState();
  let viewport: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 };
  let notePopup: NotePopupHandle | null = null;
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
  let visibleLinkIndexes: ReadonlySet<number> = new Set();
  let filterPanel: FilterPanelHandle | null = null;
  let wordListPanel: WordListPanelHandle | null = null;
  let linkListPanel: LinkListPanelHandle | null = null;
  let minimapPanel: MinimapPanelHandle | null = null;
  let exportPanel: ExportPanelHandle | null = null;
  let clusterListPanel: ClusterListPanelHandle | null = null;
  let timelinePanel: TimelinePanelHandle | null = null;
  let selectedClusterIndex: number | null = null;
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
  const wordsTabPanel = createTabPanel('words');
  const linksTabPanel = createTabPanel('links');
  const minimapTabPanel = createTabPanel('minimap');
  const clustersTabPanel = createTabPanel('clusters');
  const timelineTabPanel = createTabPanel('timeline');
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
    const filterState = {
      file,
      filter: options.filter,
      counts: filterCounts,
      t,
      selectedSliceLabels: timelineView.selectedSliceLabels,
    };
    const wordsState = { file, visibleNodeIndexes, selectedNodeIndex, t };
    const linksState = { file, visibleLinkIndexes, selectedNodeIndex, t };
    filterPanel?.update(filterState);
    clusterListPanel?.update({ file, selectedClusterIndex, t });
    timelinePanel?.update({ file, view: timelineView, t });
    wordListPanel?.update(wordsState);
    linkListPanel?.update(linksState);
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
    // 編集で添字がずれると、出したままのポップアップが別の要素の内容を指すことになる。
    notePopup?.hide();
    fitted = false;
    syncCanvasLabel();
    if (notifyHost) options.onFileChange?.(file);
    beginLayoutIfNeeded();
    // パネルはレイアウトの完了ではなくファイルの変更に追従させる。
    //
    // Why not beginLayoutIfNeeded に任せるか: 座標に影響しない編集（共起の向き。設計書 §2.4）は
    // キャッシュ判定が hit になりレイアウトが走らないため、レイアウト完了を契機にすると、その
    // 経路だけ一覧が古いまま固まる。座標が変わる編集でも、パネルの内容は座標と無関係である。
    updatePanels();
  }

  function ensurePanels(): void {
    if (filterPanel && wordListPanel && linkListPanel) return;
    filterPanel = createFilterPanel({
      file,
      filter: options.filter,
      counts: filterCounts,
      t,
      selectedSliceLabels: timelineView.selectedSliceLabels,
      onFilterChange(nextFilter) {
        options = { ...options, filter: nextFilter };
        fitted = false;
        rebuildGraph();
        updatePanels();
      },
      onSelectedSliceLabelsChange(selected) {
        timelineView = { ...timelineView, selectedSliceLabels: selected };
        // レイヤーの枚数が変わると図の外接矩形も変わる。全体表示をやり直さないと、
        // 落としたレイヤーの跡の空白を見たままになる。
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
    linkListPanel = createLinkListPanel({
      file,
      visibleLinkIndexes,
      selectedNodeIndex,
      t,
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
    clusterListPanel = createClusterListPanel({
      file,
      selectedClusterIndex,
      t,
      onSelectCluster(clusterIndex) {
        selectedClusterIndex = clusterIndex;
        updatePanels();
      },
      onFileChange: (nextFile) => applyFileChange(nextFile, true),
      onHoverCluster(clusterIndex, anchor) {
        if (clusterIndex === null || anchor === null) {
          notePopup?.hide();
          return;
        }
        const popupState = clusterPopupState(file, clusterIndex, t);
        if (popupState === null) return;
        notePopup?.show(popupState, toRootPoint(anchor));
      },
    });
    timelinePanel = createTimelinePanel({
      file,
      view: timelineView,
      t,
      onFileChange: (nextFile) => applyFileChange(nextFile, true),
      onViewChange(nextView) {
        timelineView = nextView;
        // 表示状態を変えただけなのでレイアウトは走らない。図の組み直しだけを要求する
        // （設計書 §2.4: 時間軸はレイアウトの入力ではない）。
        rebuildGraph();
        updatePanels();
      },
    });
    timelineTabPanel.appendChild(timelinePanel.element);
    clustersTabPanel.appendChild(clusterListPanel.element);
    filterTabPanel.appendChild(filterPanel.element);
    wordsTabPanel.appendChild(wordListPanel.element);
    linksTabPanel.appendChild(linkListPanel.element);
    minimapTabPanel.appendChild(minimapPanel.element);
    // tabpanel の DOM 順もアイコンの並びに合わせる。見た目には 1 枚しか出ないが、
    // 支援技術の読み上げ順と Tab キーの移動順はこの順序に従う。
    panelRoot.append(
      minimapTabPanel,
      filterTabPanel,
      wordsTabPanel,
      linksTabPanel,
      clustersTabPanel,
      timelineTabPanel,
    );
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
      case 'words':
        return { id, label: t('tabs.words'), panelId: wordsTabPanel.id };
      case 'links':
        return { id, label: t('tabs.links'), panelId: linksTabPanel.id };
      case 'minimap':
        return { id, label: t('tabs.minimap'), panelId: minimapTabPanel.id };
      case 'clusters':
        return { id, label: t('tabs.clusters'), panelId: clustersTabPanel.id };
      case 'timeline':
        return { id, label: t('tabs.timeline'), panelId: timelineTabPanel.id };
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
    wordsTabPanel.hidden = activeTab !== 'words';
    linksTabPanel.hidden = activeTab !== 'links';
    minimapTabPanel.hidden = activeTab !== 'minimap';
    clustersTabPanel.hidden = activeTab !== 'clusters';
    timelineTabPanel.hidden = activeTab !== 'timeline';
    exportTabPanel.hidden = activeTab !== 'export';
    // 開いているかは制御される側（tabpanel）が持つ。`tab` に `aria-expanded` を置くのは
    // 現行の指針から外れる（`SideIconRail` の Why not を参照）。
    for (const tabPanel of [
      filterTabPanel,
      wordsTabPanel,
      linksTabPanel,
      clustersTabPanel,
      timelineTabPanel,
      minimapTabPanel,
      exportTabPanel,
    ]) {
      tabPanel.setAttribute('aria-expanded', String(showPanels && !tabPanel.hidden));
    }
    rail.update(railState());
    // 畳んでいる間の作り直しは意味を持たない。列の高さが 0 のまま組むと、仮想リストの
    // 可視ウィンドウが 0 行で確定し、開き直しても空のまま残る。
    if (!showPanels) return;
    if (activeTab === 'words') wordListPanel?.refresh();
    if (activeTab === 'links') linkListPanel?.refresh();
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

  /** クライアント座標をポップアップの基準（root）座標へ移す。 */
  function toRootPoint(point: { x: number; y: number }): { x: number; y: number } {
    const rect = root.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  /**
   * 図の上のホバーをポップアップへ反映する。
   *
   * 円を先に試す（設計書 §3.1）。線を優先すると、円は線より小さく線は円の間を通るため、
   * 円の上にいるのに線が拾われて語を触れなくなる。
   */
  function syncCanvasHover(point: { x: number; y: number }, client: { x: number; y: number }): void {
    const node = hitTestNode(graph, point.x, point.y, viewport);
    const popupState =
      node === null
        ? (() => {
            const link = hitTestLink(graph, point.x, point.y, viewport);
            return link === null ? null : linkPopupState(file, link.index, t, linkLayerContext(link));
          })()
        : nodePopupState(file, node.index, t, nodeLayerContext(node));
    if (popupState === null) {
      notePopup?.hide();
      return;
    }
    notePopup?.show(popupState, toRootPoint(client));
  }

  function isLayered(): boolean {
    return timelineView.layered && cooccurrenceSliceCount(file.spec) > 0;
  }

  /**
   * レイヤー表示の 1 枚ごとの表示対象を作る。
   *
   * 絞り込みの 5 条件はレイヤーごとに、そのスライスの値を基準として適用する（設計書 §3.6.5）。
   * 全体値を基準にすると、あるスライスで 1 回しか現れない語が、全期間で 50 回現れることを
   * 理由に全レイヤーへ描かれる。
   */
  function buildLayerInputs(): { inputs: RenderLayerInput[]; nodes: Set<number>; links: Set<number> } {
    const timeline = file.spec.timeline;
    const slices = timeline?.slices ?? [];
    const placements = computeLayerPlacements({
      slices,
      visibleSliceIndexes: visibleSliceIndexes(slices, timelineView.selectedSliceLabels),
      bounds: unionBounds(positions, RADIUS_MAX),
      axis: timelineView.axis,
      gap: timelineView.gap,
    });
    const nodes = new Set<number>();
    const links = new Set<number>();
    const inputs = placements.map((placement) => {
      const filtered = filterCooccurrenceFile(file, { ...options.filter, sliceIndex: placement.slice });
      filtered.nodeIndexes.forEach((index) => nodes.add(index));
      filtered.linkIndexes.forEach((index) => links.add(index));
      return {
        placement,
        visibleNodeIndexes: filtered.nodeIndexes,
        visibleLinkIndexes: filtered.linkIndexes,
      };
    });
    return { inputs, nodes, links };
  }

  /**
   * 触れた円が属するレイヤーの値。単一表示では undefined（全期間の値が出る）。
   *
   * 円の大きさはそのスライスの値で描かれているため、合計だけを出すと「小さい円に大きい数字」が
   * 並び、どちらが今見ている値なのか読めない（設計書 §3.6）。
   */
  function nodeLayerContext(node: RenderNode): NodePopupLayerContext | undefined {
    const layer = graph.layers[node.layer];
    if (layer === undefined) return undefined;
    return { sliceLabel: layer.label, frequency: node.frequency, cooccurrenceCount: node.cooccurrenceCount };
  }

  function linkLayerContext(link: RenderLink): LinkPopupLayerContext | undefined {
    const layer = graph.layers[link.layer];
    if (layer === undefined) return undefined;
    return { sliceLabel: layer.label, strength: link.strength };
  }

  function rebuildGraph(): void {
    if (isLayered()) {
      const layered = buildLayerInputs();
      // 表示件数は「1 枚でも描かれた語・共起」を数える。レイヤーごとの延べ数にすると、全体の
      // 語数（分母）と桁が揃わず、どれだけ絞れているのかが読めなくなる。
      visibleNodeIndexes = layered.nodes;
      visibleLinkIndexes = layered.links;
      filterCounts = {
        visibleNodeCount: layered.nodes.size,
        visibleLinkCount: layered.links.size,
        totalNodeCount: file.spec.nodes.length,
        totalLinkCount: file.spec.links.length,
      };
      graph = buildRenderGraph({
        file,
        positions,
        themeTarget: root,
        mode: themeMode,
        layers: layered.inputs,
        showTimeLinks: timelineView.showTimeLinks,
      });
    } else {
      const filtered = filterCooccurrenceFile(file, options.filter);
      filterCounts = filtered.counts;
      visibleNodeIndexes = filtered.nodeIndexes;
      visibleLinkIndexes = filtered.linkIndexes;
      graph = buildRenderGraph({
        file,
        positions,
        themeTarget: root,
        mode: themeMode,
        layers: [{ visibleNodeIndexes: filtered.nodeIndexes, visibleLinkIndexes: filtered.linkIndexes }],
      });
    }
    statusEl.textContent = t('status.summary', {
      visibleWords: filterCounts.visibleNodeCount,
      totalWords: filterCounts.totalNodeCount,
      visibleCooccurrences: filterCounts.visibleLinkCount,
      totalCooccurrences: filterCounts.totalLinkCount,
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
    syncCanvasHover(point, { x: event.clientX, y: event.clientY });
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
  canvas.addEventListener('pointerleave', () => notePopup?.hide());
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

  notePopup = createNotePopup({ container: root, t });
  rebuildGraph();
  syncPanelVisibility();
  beginLayoutIfNeeded();
  scheduler = createRenderScheduler({
    canvas,
    themeHost: root,
    getState: () => ({ graph, viewport, selectedNodeIndex, themeMode }),
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
        notePopup?.setT(t);
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
        // applyFileChange が内部で updatePanels() まで済ませる。ここで重ねて呼ぶと、同じ状態で
        // 一覧を 2 回作り直すだけになる。
        applyFileChange(partial.file, false);
      } else {
        rebuildGraph();
        updatePanels();
      }
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
      linkListPanel?.destroy();
      minimapPanel?.destroy();
      exportPanel?.destroy();
      clusterListPanel?.destroy();
      timelinePanel?.destroy();
      notePopup?.destroy();
      root.remove();
    },
    getLayoutStatus: () => status,
    getCacheDecision: () => cacheDecision,
    getLayoutRunCount: () => layoutRunCount,
    getRenderFrameCount: () => scheduler?.getFrameCount() ?? 0,
    getFilterCounts: () => filterCounts,
    getTimelineLayerState: () =>
      graph.layers.length === 0
        ? null
        : { axis: timelineView.axis, layerCount: graph.layers.length, timeLinkCount: graph.timeLinks.length },
    getMinimapDrawCount: () => minimapPanel?.getDrawCount() ?? 0,
    getNotePopupState: () => notePopup?.getState() ?? null,
  };
}
