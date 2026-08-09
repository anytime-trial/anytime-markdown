import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  addCooccurrenceNodeWithLink,
  computeSpecHash,
  cooccurrenceSliceCount,
  filterCooccurrenceFile,
  hasCooccurrenceTimeline,
  readLink,
  writeLink,
  type CooccurrenceFile,
  type CooccurrenceFilterCounts,
} from '@anytime-markdown/graph-core';
import type {
  CacheDecision,
  CardLayoutState,
  CooccurrenceSkin,
  ClusterLaneState,
  ClusterLaneViewState,
  CooccurrenceViewerHandle,
  CooccurrenceViewerOptions,
  CooccurrenceViewerUpdate,
  LayoutStatus,
  RenderCardColumn,
  RenderClusterLane,
  RenderGraph,
  RenderLink,
  RenderNode,
  TimelineLayerState,
  TimelineViewState,
  ViewportBounds,
  ViewportState,
} from './types';
import { evaluateLayoutCache } from './layout/cache';
import { LayoutCancelledError, startLayoutJob, type LayoutJob } from './layout/runLayout';
import { buildRenderGraph, type RenderLayerInput } from './render/buildRenderGraph';
import { computeLayerPlacements, unionBounds } from './render/layerLayout';
import {
  applyClusterLanes,
  clusterMembership,
  computeClusterLanePlacements,
  type ClusterLanePlacement,
} from './render/clusterLanes';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  computeCardLayout,
  type CardColumnPlacement,
} from './render/cardLayout';
import { RADIUS_MAX } from './render/scales';
import { defaultTimelineViewState, visibleSliceIndexes } from './ui/timelineModel';
import { clusterLaneAxis, defaultClusterLaneViewState } from './ui/clusterLaneModel';
import { graphBounds } from './render/bounds';
import { updateCanvasSize } from './render/canvasSize';
import { createRenderScheduler, type RenderScheduler } from './render/renderScheduler';
import { createCooccurrenceT, type CooccurrenceT } from './i18n/createCooccurrenceT';
import { applyCooccurrenceThemeVars } from './theme/applyCooccurrenceThemeVars';
import { clusterColor } from './theme/readTheme';
import { buildOzSceneModel } from './scene3d/sceneModel';
import { createOzRenderer, type OzRenderer } from './scene3d/ozRenderer';
import { createPanelButton } from './ui/buttonBaseStyle';
import { createFilterPanel, type FilterPanelHandle } from './ui/FilterPanel';
import { createWordListPanel, type WordListPanelHandle } from './ui/WordListPanel';
import { createLinkListPanel, type LinkListPanelHandle } from './ui/LinkListPanel';
import { createMinimapPanel, type MinimapPanelHandle } from './ui/MinimapPanel';
import { createExportPanel, type ExportPanelHandle, type ExportPanelState } from './ui/ExportPanel';
import { createClusterListPanel, type ClusterListPanelHandle } from './ui/ClusterListPanel';
import { createTimelinePanel, type TimelinePanelHandle } from './ui/TimelinePanel';
import { createAddElementPopup, type AddElementPopupHandle } from './ui/AddElementPopup';
import { addHandlePlacement, shouldShowAddHandle } from './ui/addElementModel';
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
import { fitBounds, pan, screenToWorld, zoomAt } from './viewport/viewport';
import { hitTestLink, hitTestNode } from './viewport/hitTest';

const STYLE_ID = 'cooccurrence-viewer-style';

/** 視野が落ち着いたと見なすまでの静止時間（ミリ秒）。 */
const DEFAULT_VIEWPORT_CHANGE_DELAY_MS = 300;

/** 画面下の注記を出した理由。枠が 1 つしかないため、消してよいかの判定に使う。 */
type NoticeOwner = 'webgl' | 'edit';

/** 追加アイコンの一辺（px）。図の拡大率に依らず一定に保つ（要件書 §2.2）。 */
const ADD_HANDLE_SIZE = 28;
/** 語の縁と追加アイコンの間の余白（px）。 */
const ADD_HANDLE_GAP = 4;

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
.cooc-add-handle{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--cooc-divider);border-radius:14px;background:var(--cooc-surface);color:var(--cooc-text);font:16px system-ui,sans-serif;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.3)}
.cooc-add-handle:hover{background:var(--cooc-action-hover)}
.cooc-add-handle[hidden]{display:none}
.cooc-viewer__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 10px;font:12px system-ui,sans-serif}
.cooc-viewer__button:hover{background:var(--cooc-action-hover)}
.cooc-viewer__status{position:absolute;inset:auto 12px 12px 12px;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif;pointer-events:none}
.cooc-viewer__oz{position:absolute;inset:0;overflow:hidden}
.cooc-viewer__oz canvas{display:block;width:100%;height:100%}
.cooc-viewer__notice{position:absolute;inset:12px auto auto 12px;max-width:70%;padding:6px 10px;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);font:12px system-ui,sans-serif}
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

/**
 * スライス別の入力（文字列）を書き込み用の数値へ写す。
 *
 * 空欄は「そのスライスには無い」を表すため undefined にする。0 に丸めると、値が無いことと
 * 値が 0 であることの区別が消える。
 */
function toSliceNumbers(values: readonly string[] | undefined): (number | undefined)[] | undefined {
  if (values === undefined) return undefined;
  return values.map((value) => (value.trim() === '' ? undefined : Number(value)));
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
  let graph: RenderGraph = { nodes: [], links: [], timeLinks: [], layers: [], clusterLanes: [] };
  let timelineView: TimelineViewState = defaultTimelineViewState();
  let clusterLaneView: ClusterLaneViewState = defaultClusterLaneViewState();
  /** 直近の組み立てで使ったレーン。観測点と、レーン名の描画に使う。 */
  let clusterLanes: ClusterLanePlacement[] = [];
  let viewport: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 };
  /** onViewportChange のデバウンスタイマー。destroy で必ず止める。 */
  let viewportChangeTimer: ReturnType<typeof setTimeout> | null = null;
  let notePopup: NotePopupHandle | null = null;
  /**
   * 編集モード。既定は切（閲覧専用）で、ファイルにもホストにも保存しない（要件書 §2.1）。
   *
   * 閲覧のたびに入っていると、図を読むだけのときの誤操作がそのままファイルの変更になる。
   */
  let editMode = false;
  let addPopup: AddElementPopupHandle | null = null;
  let selectedNodeIndex: number | null = null;
  let showPanels = options.showPanels ?? true;
  let currentJob: LayoutJob | null = null;
  let destroyed = false;
  let scheduler: RenderScheduler | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let skin: CooccurrenceSkin = 'standard';
  /** カード表示の観測点。card スキンで図を組んだときだけ持つ。 */
  let cardState: CardLayoutState | null = null;
  let ozView: OzRenderer | null = null;
  let ozContainer: HTMLDivElement | null = null;
  /** WebGL 初期化に一度失敗したら再試行しない（毎トグルで throw を繰り返さないため）。 */
  let ozUnavailable = false;
  let noticeEl: HTMLDivElement | null = null;
  let noticeOwner: NoticeOwner | null = null;
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

  /**
   * 選択中の語の脇に出る追加アイコン（要件書 §2.2）。
   *
   * Why not キャンバスへ描くか: 図と一緒に拡縮すると縮小表示で数 px まで縮んで押せなくなり、
   * キャンバスはフォーカスを持てないためキーボードから到達できない。当たり判定と描画の
   * 両方に手を入れずに済む利点もある。
   */
  const addHandle = createPanelButton('cooc-add-handle');
  addHandle.dataset.role = 'add-handle';
  addHandle.textContent = '＋';
  addHandle.hidden = true;
  stage.appendChild(addHandle);
  syncAddHandleLabel();
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
    onToggleEditMode() {
      setEditMode(!editMode);
    },
  });
  main.appendChild(rail.element);

  addHandle.addEventListener('click', () => {
    if (selectedNodeIndex === null) return;
    const rect = addHandle.getBoundingClientRect();
    ensureAddPopup().show({
      file,
      sourceNodeIndex: selectedNodeIndex,
      // アイコンの右下から出す。真上に出すとアイコン自体を覆い、閉じる前に押し直せない。
      anchor: toRootPoint({ x: rect.right, y: rect.bottom }),
      returnFocusTo: addHandle,
    });
  });

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
    clusterListPanel?.update({
      file,
      selectedClusterIndex,
      laneView: clusterLaneView,
      ...(skin === 'card' ? { laneLockedReason: t('clusters.laneUnavailableCard') } : {}),
      t,
    });
    timelinePanel?.update({ file, view: timelineView, t });
    wordListPanel?.update(wordsState);
    linkListPanel?.update(linksState);
    syncExportPanel();
    minimapPanel?.setT(t);
    minimapPanel?.refresh();
    exportPanel?.update(exportPanelState());
  }

  /**
   * @param preserveViewport true なら図の差し替えで視野を合わせ直さない。
   *   視野駆動配信（見えている範囲だけを取り直す）で使う。合わせ直すと、届いた図に
   *   カメラが吸い寄せられ → 視野が変わり → また取り直す、が止まらなくなる。
   */
  function applyFileChange(
    nextFile: CooccurrenceFile,
    notifyHost: boolean,
    preserveViewport = false,
  ): void {
    file = nextFile;
    options = { ...options, file };
    positions = file.layout?.positions ?? fallbackPositions(file);
    // Why not selectNode(null): 直後の再構築（rebuildGraph / レイアウト）が 2D・3D・パネルへ
    // まとめて伝播する。ここで selectNode を呼ぶと差し替え前の古い graph で 3D を一度描き直す。
    selectedNodeIndex = null;
    // 編集で添字がずれると、出したままのポップアップが別の要素の内容を指すことになる。
    notePopup?.hide();
    // 添字がずれるのはメモのポップアップと同じ。開いたままにすると相手を失った状態で
    // 登録でき、理由の無いエラーだけが出る。
    addPopup?.hide();
    if (!preserveViewport) fitted = false;
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
      editable: editMode,
      file,
      visibleNodeIndexes,
      selectedNodeIndex,
      t,
      onSelectNode(nodeIndex) {
        selectNode(nodeIndex);
      },
      onFileChange: (nextFile) => applyFileChange(nextFile, true),
    });
    linkListPanel = createLinkListPanel({
      editable: editMode,
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
      editable: editMode,
      file,
      selectedClusterIndex,
      laneView: clusterLaneView,
      t,
      onSelectCluster(clusterIndex) {
        selectedClusterIndex = clusterIndex;
        updatePanels();
      },
      onLaneViewChange(nextView) {
        clusterLaneView = nextView;
        // レーン化は図の外接矩形を変える。全体表示をやり直さないと、伸びた方向が画面の外に出たままになる。
        fitted = false;
        rebuildGraph();
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
      editable: editMode,
      file,
      view: timelineView,
      t,
      onFileChange: (nextFile) => applyFileChange(nextFile, true),
      onSliceRenamed(from, to) {
        const selected = timelineView.selectedSliceLabels;
        if (selected === undefined || !selected.includes(from)) return;
        timelineView = {
          ...timelineView,
          selectedSliceLabels: selected.map((label) => (label === from ? to : label)),
        };
      },
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
        // OZ 3D では視野矩形が意味を持たないため押せなくする（要件書 §2.4）。
        return {
          id,
          label: t('tabs.minimap'),
          panelId: minimapTabPanel.id,
          disabled: skin === 'oz',
          disabledReason: t('minimap.unavailable3d'),
        };
      case 'clusters':
        return { id, label: t('tabs.clusters'), panelId: clustersTabPanel.id };
      case 'timeline':
        // カード表示はレイヤー化しない（要件書「カード表示（card スキン）」§2.5）。押せなくして
        // 理由を出す（minimap の OZ 無効化と同型）。
        return {
          id,
          label: t('tabs.timeline'),
          panelId: timelineTabPanel.id,
          disabled: skin === 'card',
          disabledReason: t('timeline.unavailableCard'),
        };
      case 'export':
        return { id, label: t('tabs.export'), panelId: exportTabPanel.id };
    }
  }

  function tabItems(): readonly SideIconRailItem[] {
    return displayedTabIds().map(tabItem);
  }

  /** アイコン列へ流し込む状態。選択中のタブと、パネルを開いているかを一緒に渡す。 */
  /**
   * 追加アイコンの表示と位置を合わせる。
   *
   * 呼ぶ契機は 5 つ（拡大縮小・移動 / 図の組み直し / 選択 / 表示形式の切り替え / 表示領域の
   * 寸法変化）。1 つでも落とすとアイコンが語から離れた場所に取り残される。寸法変化を含める
   * のは、端の折り返しが表示領域の幅と高さで決まるためで、パネルを開いて図が狭くなった
   * 瞬間に古い幅のまま図の外へ残る。
   */
  /** 図柄だけのボタンなので、名前と tooltip を持たせる。言語切替でも訳し直す。 */
  function syncAddHandleLabel(): void {
    addHandle.setAttribute('aria-label', t('edit.add'));
    addHandle.title = t('edit.add');
  }

  function syncAddHandle(): void {
    const node =
      selectedNodeIndex === null
        ? undefined
        : graph.nodes.find((candidate) => candidate.index === selectedNodeIndex);
    const visible = shouldShowAddHandle({
      editMode,
      skin,
      selectedNodeIndex,
      hasPosition: node !== undefined,
    });
    addHandle.hidden = !visible;
    if (!visible || node === undefined) return;
    const placement = addHandlePlacement({
      node: { x: node.x, y: node.y, radius: node.radius },
      viewport,
      canvas: canvasDisplaySize(),
      handleSize: ADD_HANDLE_SIZE,
      gap: ADD_HANDLE_GAP,
    });
    addHandle.style.left = `${placement.x}px`;
    addHandle.style.top = `${placement.y}px`;
  }

  function ensureAddPopup(): AddElementPopupHandle {
    if (addPopup !== null) return addPopup;
    addPopup = createAddElementPopup({
      container: root,
      t,
      onSubmit(values) {
        if (selectedNodeIndex === null) return { ok: false, reason: '' };
        const layered = hasCooccurrenceTimeline(file.spec);
        const result = addCooccurrenceNodeWithLink(file, {
          node: layered
            ? { label: values.label, sliceValues: toSliceNumbers(values.sliceFrequencies) }
            : { label: values.label, frequency: Number(values.frequency) },
          source: selectedNodeIndex,
          strength: layered ? 0 : Number(values.strength),
          linkSliceValues: layered ? toSliceNumbers(values.sliceStrengths) : undefined,
          clusterIndex: values.clusterIndex ?? undefined,
        });
        if (!result.ok) return { ok: false, reason: result.errors[0]?.message ?? '' };
        const addedIndex = result.file.spec.nodes.length - 1;
        applyFileChange(result.file, true);
        // 選択の復帰は applyFileChange の後に置く。applyFileChange は差し替え前の図で
        // 選択を落とすため、先に選ぶと足した語が選ばれないまま残る。
        selectNode(addedIndex);
        return { ok: true };
      },
    });
    return addPopup;
  }

  /**
   * 編集モードを切り替える。
   *
   * Why not 各パネルの側で編集モードを見に行くか: 反映先はパネル 4 枚と図の操作面に分かれる。
   * 入口を 1 つにしないと、どれか 1 つだけ古い状態のまま残る。
   */
  function setEditMode(next: boolean): void {
    editMode = next;
    wordListPanel?.setEditable(editMode);
    linkListPanel?.setEditable(editMode);
    clusterListPanel?.setEditable(editMode);
    timelinePanel?.setEditable(editMode);
    rail.update(railState());
    syncEditNotice();
    syncAddHandle();
    if (!editMode) addPopup?.hide();
  }

  /** 3D・カード表示中は図から足せない。押せないだけにせず、理由を画面に出す（要件書 §2.2）。 */
  function syncEditNotice(): void {
    if (editMode && skin === 'oz') {
      showNotice('edit', t('edit.unavailable3d'));
      return;
    }
    if (editMode && skin === 'card') {
      showNotice('edit', t('edit.unavailableCard'));
      return;
    }
    hideNotice('edit');
  }

  function railState(): SideIconRailState {
    return {
      items: tabItems(),
      activeId: activeTab,
      expanded: showPanels,
      listLabel: t('tabs.listLabel'),
      editMode,
      editModeLabel: t('edit.mode'),
    };
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
    // 選択中のタブが capability の変化で消える・OZ 3D で無効になることがある。放置すると、
    // どのタブも選ばれていない（内容が何も出ない）状態が残る。
    const selectable = (id: CooccurrenceTabId): boolean =>
      !(id === 'minimap' && skin === 'oz') && !(id === 'timeline' && skin === 'card');
    if (!displayed.includes(activeTab) || !selectable(activeTab)) {
      activeTab = displayed.find(selectable) ?? displayed[0] ?? 'minimap';
    }
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
  function buildLayerInputs(
    layoutPositions: readonly (readonly [number, number])[],
  ): { inputs: RenderLayerInput[]; nodes: Set<number>; links: Set<number> } {
    const timeline = file.spec.timeline;
    const slices = timeline?.slices ?? [];
    const placements = computeLayerPlacements({
      slices,
      visibleSliceIndexes: visibleSliceIndexes(slices, timelineView.selectedSliceLabels),
      // レーン化後の座標から取る。レーン化前のままだと、レーンで伸びた方向にレイヤー名だけが
      // 取り残される（要件書 §2.5）。スライス軸方向のスパンはレーン化で変わらないため、
      // レイヤーのピッチは影響を受けない。
      bounds: unionBounds(layoutPositions, RADIUS_MAX),
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

  /**
   * クラスタレーンの配置（要件書「クラスタレーン表示」§2.2）。レーン化していないときは空。
   *
   * クラスタを 1 つも持たないファイルではレーンが 1 本しかできず、表示が変わらない。
   */
  function computeLanes(): ClusterLanePlacement[] {
    const clusters = file.spec.clusters ?? [];
    if (!clusterLaneView.enabled || clusters.length === 0) return [];
    return computeClusterLanePlacements({
      positions,
      membership: clusterMembership(file),
      clusterCount: clusters.length,
      axis: clusterLaneAxis(isLayered() ? timelineView.axis : null),
      gap: clusterLaneView.gap,
      padding: RADIUS_MAX,
      subclusters: clusters.map((cluster) => (cluster.subclusters ?? []).map((sub) => sub.members)),
    });
  }

  /** レーン名を描くための情報。座標は `RenderNode` へ織り込み済みで、ここでは名前と色だけを解決する。 */
  function renderClusterLanes(lanes: readonly ClusterLanePlacement[]): RenderClusterLane[] {
    const axis = clusterLaneAxis(isLayered() ? timelineView.axis : null);
    return lanes.map((lane) => {
      const label =
        lane.cluster === undefined
          ? t('clusters.unclustered')
          : file.spec.clusters?.[lane.cluster]?.label || t('clusters.untitled', { index: lane.cluster + 1 });
      const subclusters = lane.cluster === undefined ? [] : (file.spec.clusters?.[lane.cluster]?.subclusters ?? []);
      return {
        ...(lane.cluster === undefined ? {} : { cluster: lane.cluster }),
        axis,
        label,
        color: clusterColor(root, lane.cluster),
        labelX: lane.labelX,
        labelY: lane.labelY,
        // 残余サブレーンは名前を持たない。「その他」という名のサブクラスタが在るように見せない。
        subLanes: lane.subLanes.map((sub) => ({
          ...(sub.subcluster === undefined ? {} : { label: subclusters[sub.subcluster]?.label ?? '' }),
          labelX: sub.labelX,
          labelY: sub.labelY,
        })),
      };
    });
  }

  /**
   * カード表示の図を組む（要件書「カード表示（card スキン）」§2.2）。
   *
   * 力学レイアウトの `positions` を使わず、カードレイアウト純関数の座標へ差し替える。
   * レイアウトの計算状態（running / done）に依存しないため、計算中でもカード図は完成形で出る。
   * 時間軸はカード表示中レイヤー化しない（全期間合算の単一図。§2.5）。
   */
  function rebuildCardGraph(): void {
    clusterLanes = [];
    const filtered = filterCooccurrenceFile(file, options.filter);
    filterCounts = filtered.counts;
    visibleNodeIndexes = filtered.nodeIndexes;
    visibleLinkIndexes = filtered.linkIndexes;
    const layout = computeCardLayout({ file, visibleNodeIndexes: filtered.nodeIndexes });
    cardState = layout.state;
    graph = buildRenderGraph({
      file,
      positions: layout.positions,
      themeTarget: root,
      mode: themeMode,
      layers: [{ visibleNodeIndexes: filtered.nodeIndexes, visibleLinkIndexes: filtered.linkIndexes }],
      cardView: { cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, columns: renderCardColumns(layout.columns) },
    });
  }

  /** カラム名と色を解決する。無題・未分類の文言はレーン表示（renderClusterLanes）と同じ規則。 */
  function renderCardColumns(columns: readonly CardColumnPlacement[]): RenderCardColumn[] {
    return columns.map((column) => {
      const label =
        column.cluster === undefined
          ? t('clusters.unclustered')
          : file.spec.clusters?.[column.cluster]?.label || t('clusters.untitled', { index: column.cluster + 1 });
      const subclusters =
        column.cluster === undefined ? [] : (file.spec.clusters?.[column.cluster]?.subclusters ?? []);
      return {
        ...(column.cluster === undefined ? {} : { cluster: column.cluster }),
        label,
        color: clusterColor(root, column.cluster),
        x: column.x,
        y: column.y,
        width: column.width,
        // 名前の無いサブクラスタ見出しは描かない（残余サブレーンに名前を与えないのと同じ理由）。
        subHeaders: column.subHeaders.flatMap((sub) => {
          const subLabel = subclusters[sub.subcluster]?.label;
          return subLabel === undefined || subLabel === '' ? [] : [{ label: subLabel, x: sub.x, y: sub.y }];
        }),
      };
    });
  }

  function rebuildGraph(): void {
    if (skin === 'card') {
      rebuildCardGraph();
      finishRebuildUi();
      return;
    }
    cardState = null;
    clusterLanes = computeLanes();
    const layoutPositions = clusterLanes.length === 0 ? positions : applyClusterLanes(positions, clusterLanes);
    const lanes = renderClusterLanes(clusterLanes);
    if (isLayered()) {
      const layered = buildLayerInputs(layoutPositions);
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
        positions: layoutPositions,
        themeTarget: root,
        mode: themeMode,
        layers: layered.inputs,
        showTimeLinks: timelineView.showTimeLinks,
        clusterLanes: lanes,
      });
    } else {
      const filtered = filterCooccurrenceFile(file, options.filter);
      filterCounts = filtered.counts;
      visibleNodeIndexes = filtered.nodeIndexes;
      visibleLinkIndexes = filtered.linkIndexes;
      graph = buildRenderGraph({
        file,
        positions: layoutPositions,
        themeTarget: root,
        mode: themeMode,
        layers: [{ visibleNodeIndexes: filtered.nodeIndexes, visibleLinkIndexes: filtered.linkIndexes }],
        clusterLanes: lanes,
      });
    }
    finishRebuildUi();
  }

  /** 図の組み直しに連動する共通の後処理（カード表示・円の図で同一）。 */
  function finishRebuildUi(): void {
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
    // 3D シーンは RenderGraph の派生。graph を組み直した経路すべて（絞り込み・編集・
    // レイアウト完了・テーマ）で自動的に追従させる。
    syncOzScene();
    // 座標は graph が持つ。組み直しのたびにアイコンの位置も取り直す。
    syncAddHandle();
  }

  /**
   * 選択状態を差し替える唯一の入口。
   *
   * Why not 各ハンドラで `selectedNodeIndex = ...` と代入するか: 選択の反映先は
   * 2D（scheduler）・3D（syncOzScene）・パネルの 3 つあり、代入と伝播が分かれていると
   * 経路ごとに伝播漏れが起きる。実際に語一覧からの選択だけ 3D へ届かず、カメラを
   * 動かしても古い選択のまま描き続けた（setViewport と同じ構造の再発）。
   */
  function selectNode(next: number | null): void {
    selectedNodeIndex = next;
    scheduler?.invalidate();
    syncOzScene();
    updatePanels();
    syncAddHandle();
    // 選択が変わればポップアップの相手も変わる。ポップアップは見出しに開いた時点の相手を
    // 出したままなので、開いたままにすると「金利 との共起」と読める画面で別の語へ結ばれる。
    const popupSource = addPopup?.getSourceNodeIndex() ?? null;
    if (popupSource !== null && popupSource !== next) addPopup?.hide();
  }

  /** graph と選択状態を 3D シーンへ写す。standard 中は何もしない。 */
  function syncOzScene(): void {
    if (skin !== 'oz') return;
    // クラスタ見出し（v2）はファイルのクラスタ label から。無題は sceneModel 側で落ちる。
    const clusterLabels = file.spec.clusters?.map((cluster) => cluster.label) ?? [];
    ozView?.setModel(buildOzSceneModel(graph, selectedNodeIndex, clusterLabels));
  }

  /**
   * 注記の持ち主。枠は 1 つしかないため、誰が出したかを覚えていないと、別の理由の告知を
   * 横から消してしまう（WebGL の縮退の告知を編集モードの切り替えが消していた）。
   */
  function showNotice(owner: NoticeOwner, text: string): void {
    noticeOwner = owner;
    if (noticeEl === null) {
      noticeEl = document.createElement('div');
      noticeEl.className = 'cooc-viewer__notice';
      stage.appendChild(noticeEl);
    }
    noticeEl.textContent = text;
  }

  function hideNotice(owner: NoticeOwner): void {
    // 自分が出したものだけを消す。持ち主が違えば別の理由の告知が出ている。
    if (noticeOwner !== owner) return;
    noticeOwner = null;
    noticeEl?.remove();
    noticeEl = null;
  }

  function handleOzSelect(index: number | null): void {
    // 2D のクリック選択と同じ規則（同じ語をもう一度選ぶと解除）。
    selectNode(index === null ? null : selectedNodeIndex === index ? null : index);
  }

  function handleOzHover(index: number | null, client: { x: number; y: number }): void {
    if (index === null) {
      notePopup?.hide();
      return;
    }
    // レイヤー文脈は渡さない（3D のレイキャストは語 index だけを返す）。全期間の値が出る。
    const popupState = nodePopupState(file, index, t, undefined);
    if (popupState === null) {
      notePopup?.hide();
      return;
    }
    notePopup?.show(popupState, toRootPoint(client));
  }

  /**
   * 3D レンダラを（無ければ）用意する。WebGL を初期化できない環境では false を返し、
   * 呼び出し側は standard に留まる（要件書 §2.1。silent fallback にしない）。
   */
  function ensureOzView(): boolean {
    if (ozView !== null) return true;
    if (ozUnavailable) {
      showNotice('webgl', t('status.webglUnavailable'));
      return false;
    }
    const element = document.createElement('div');
    element.className = 'cooc-viewer__oz';
    // ツールバー・状態表示より後ろへ挟む（DOM 順で重なりが決まる。canvas の直後）。
    canvas.insertAdjacentElement('afterend', element);
    try {
      ozView = createOzRenderer({
        container: element,
        themeMode,
        onHover: handleOzHover,
        onSelect: handleOzSelect,
      });
      ozContainer = element;
      return true;
    } catch (error) {
      element.remove();
      ozUnavailable = true;
      console.warn('[cooccurrence-viewer] WebGL renderer creation failed; staying in 2D view.', error);
      showNotice('webgl', t('status.webglUnavailable'));
      return false;
    }
  }

  function setSkin(next: CooccurrenceSkin): void {
    if (skin === next) return;
    if (next === 'oz' && !ensureOzView()) {
      syncStatusUi();
      return;
    }
    // カードと円ではレイアウト座標系が別物になる。全体表示をやり直さないと、切替後の図が
    // 前の座標系の視野のまま画面外に残る。
    if (next === 'card' || skin === 'card') fitted = false;
    skin = next;
    // 表示形式が変わればどちらの告知も前提を失う（3D へ入れた時点で WebGL の縮退は解けている）。
    hideNotice('webgl');
    hideNotice('edit');
    applyCooccurrenceThemeVars(root, themeMode, skin);
    // 球色（node.stroke）は CSS 変数から焼き込まれるため、変数の切替後に組み直す。
    // rebuildGraph が syncOzScene まで済ませる。
    rebuildGraph();
    if (skin === 'oz') {
      canvas.style.display = 'none';
      if (ozContainer) ozContainer.style.display = '';
      ozView?.setThemeMode(themeMode);
    } else {
      canvas.style.display = '';
      if (ozContainer) ozContainer.style.display = 'none';
      notePopup?.hide();
    }
    // 流れアニメーションは OZ 表示中だけ回す（standard へ戻したら GPU を止める。要件書 §5 v2）。
    ozView?.setAnimating(skin === 'oz');
    scheduler?.invalidateTheme();
    syncStatusUi();
    syncActiveTab();
    updatePanels();
    // 表示形式が変わると図から足せるかどうかも変わる。編集モードのまま 3D へ移った場合は
    // 理由を出し、アイコンは引っ込める（rebuildGraph 経由の同期は skin の更新前に走る）。
    syncEditNotice();
    syncAddHandle();
    if (skin === 'oz') addPopup?.hide();
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
    // 図が動けばアイコンも動く。ここを落とすと、拡大や移動のあとだけ語から離れる。
    syncAddHandle();
    // ミニマップの枠は視野そのものを映す。ここで要求しないと、図だけが動いて枠が取り残される。
    minimapPanel?.refresh();
    scheduleViewportChangeNotice();
  }

  /**
   * 視野が落ち着いてから 1 度だけ `onViewportChange` を呼ぶ。
   *
   * 静止を待つのは、パン中の 1 フレームごとに呼ぶと購読側（視野駆動のデータ取得）が
   * ドラッグの回数だけ要求を出すため。タイマーは destroy で必ず止める。
   */
  function scheduleViewportChangeNotice(): void {
    if (!options.onViewportChange) return;
    if (viewportChangeTimer !== null) clearTimeout(viewportChangeTimer);
    viewportChangeTimer = setTimeout(() => {
      viewportChangeTimer = null;
      if (destroyed) return;
      const bounds = visibleWorldBounds();
      // 表示領域が 0（未レイアウト・非表示タブ）のときは面積 0 の矩形になる。購読側は
      // それを視野として受け取れないので通知しない（受け取らせると「何も入らない視野」を
      // 要求してしまう）。
      if (!(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) return;
      options.onViewportChange?.(bounds);
    }, options.viewportChangeDelayMs ?? DEFAULT_VIEWPORT_CHANGE_DELAY_MS);
  }

  /** 今 canvas に映っている範囲を世界座標で返す。 */
  function visibleWorldBounds(): ViewportBounds {
    const { width, height } = canvasDisplaySize();
    const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
    const bottomRight = screenToWorld({ x: width, y: height }, viewport);
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
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

    // OZ 3D のトグルは常設する。状態（押されているか）は aria-pressed で表す。
    const skinButton = document.createElement('button');
    skinButton.className = 'cooc-btn cooc-viewer__button';
    skinButton.type = 'button';
    skinButton.textContent = t('toolbar.skinOz');
    skinButton.setAttribute('aria-pressed', String(skin === 'oz'));
    skinButton.addEventListener('click', () => setSkin(skin === 'oz' ? 'standard' : 'oz'));
    toolbar.appendChild(skinButton);

    // カード表示のトグル（要件書「カード表示（card スキン）」§2.1）。OZ のトグルの後ろへ置く
    // （既存テストはツールバー先頭の aria-pressed ボタンを OZ トグルとして参照している）。
    const cardButton = document.createElement('button');
    cardButton.className = 'cooc-btn cooc-viewer__button';
    cardButton.type = 'button';
    cardButton.textContent = t('toolbar.skinCard');
    cardButton.setAttribute('aria-pressed', String(skin === 'card'));
    cardButton.addEventListener('click', () => setSkin(skin === 'card' ? 'standard' : 'card'));
    toolbar.appendChild(cardButton);

    if (skin === 'oz') {
      const fit = document.createElement('button');
      fit.className = 'cooc-btn cooc-viewer__button';
      fit.type = 'button';
      fit.textContent = t('view.fit');
      fit.addEventListener('click', () => ozView?.fitView());
      toolbar.appendChild(fit);
    }

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
    // OZ 3D 中は現在の視点を WebGL canvas から書き出す（要件書 §2.4）。
    if (skin === 'oz' && ozView !== null) {
      void ozView.exportPng().then((blob) => {
        if (blob) options.onExportPng?.(blob);
      });
      return;
    }
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
      selectNode(hit ? (selectedNodeIndex === hit.index ? null : hit.index) : null);
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
    if (event.key === 'Escape') selectNode(null);
    scheduler?.invalidate();
    updatePanels();
  });

  resizeObserver = new ResizeObserver(() => {
    if (!fitted) fitToGraph();
    // 表示領域が変われば見えている世界範囲も変わる。ここで通知しないと、パネルを畳んで
    // 図を広げた領域は、ユーザーが少しパンするまで空白のままになる（`setViewport` は
    // 呼ばれないため既定の経路では発火しない）。デバウンス済みなので連続リサイズでも 1 回。
    scheduleViewportChangeNotice();
    // 折り返しは表示領域の寸法で決まる。ここを落とすと、パネルを開いて図が狭くなったとき
    // アイコンだけが図の外へ残る。
    syncAddHandle();
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
  // 初期スキンはトグルと同じ経路で適用する（WebGL 不能環境でも同じ縮退が働く）。
  const initialSkin = options.skin ?? 'standard';
  if (initialSkin !== 'standard') setSkin(initialSkin);

  return {
    update(partial: CooccurrenceViewerUpdate): void {
      if (partial.skin !== undefined) {
        setSkin(partial.skin);
      }
      if (partial.themeMode !== undefined) {
        themeMode = partial.themeMode;
        // skin を渡し忘れると、テーマ切替のたびに OZ の変数一式が standard へ戻る。
        applyCooccurrenceThemeVars(root, themeMode, skin);
        ozView?.setThemeMode(themeMode);
        scheduler?.invalidateTheme();
      }
      if (partial.locale !== undefined) {
        options = { ...options, locale: partial.locale };
        t = createCooccurrenceT('Cooccurrence', partial.locale);
        notePopup?.setT(t);
        addPopup?.setT(t);
        syncAddHandleLabel();
        // 出したままの注記も訳し直す（3D で編集モードに入っている場合）。
        syncEditNotice();
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
        applyFileChange(partial.file, false, partial.preserveViewport === true);
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
      if (viewportChangeTimer !== null) {
        clearTimeout(viewportChangeTimer);
        viewportChangeTimer = null;
      }
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
      ozView?.dispose();
      root.remove();
    },
    getLayoutStatus: () => status,
    getCacheDecision: () => cacheDecision,
    getLayoutRunCount: () => layoutRunCount,
    getRenderFrameCount: () => scheduler?.getFrameCount() ?? 0,
    getFilterCounts: () => filterCounts,
    // レイヤー表示の「意図」で null を分ける。描いた枚数で分けると、「レイヤー表示のはずなのに
    // 1 枚も描いていない」（全て非表示にした・選択がどのスライスにも一致しない）が単一表示と
    // 同じ null に潰れ、外から区別できない（設計書 §6.4）。
    getTimelineLayerState: () =>
      !isLayered()
        ? null
        : { axis: timelineView.axis, layerCount: graph.layers.length, timeLinkCount: graph.timeLinks.length },
    getMinimapDrawCount: () => minimapPanel?.getDrawCount() ?? 0,
    getNotePopupState: () => notePopup?.getState() ?? null,
    // カード表示の観測点。null の意味はレーン・レイヤーと同じく「カード表示でない」。
    getCardLayoutState: (): CardLayoutState | null => (skin === 'card' ? cardState : null),
    // レイヤー表示と同じく「意図」で null を分ける。レーン化を有効にしたのにレーンが 1 本も
    // できていない（クラスタが無い）ことを、レーン化していない状態と同じ null に潰さない。
    // カード表示中はレーンを描かない（要件書「カード表示（card スキン）」§2.5）ため null。
    getClusterLaneState: (): ClusterLaneState | null =>
      !clusterLaneView.enabled || skin === 'card'
        ? null
        : {
            axis: clusterLaneAxis(isLayered() ? timelineView.axis : null),
            laneCount: clusterLanes.length,
            hasUnclustered: clusterLanes.some((lane) => lane.cluster === undefined),
            subLaneCount: clusterLanes.reduce((total, lane) => total + lane.subLanes.length, 0),
            hasResidualSubLane: clusterLanes.some((lane) =>
              lane.subLanes.some((sub) => sub.subcluster === undefined),
            ),
          },
  };
}
