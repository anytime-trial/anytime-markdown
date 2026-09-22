/**
 * 系図（ダイアグラム）の閲覧と配置編集。React 非依存の vanilla DOM。
 *
 * 移植元は anytime-travel の `src/screens/Genealogy.tsx`（React）。状態と導出は `model.ts` に
 * 寄せ、この層は**イベントと DOM の更新だけ**を持つ。
 */

import {
  addDiagramGroupAxis,
  addDiagramGroupValue,
  cellKey,
  cellLimit,
  chartPoint,
  type ChartView,
  columnPitch,
  anchorKey,
  DEFAULT_CONNECTOR_LOOK,
  DEFAULT_DIAGRAM_SHAPE,
  DEFAULT_DIAGRAM_SPACING,
  type DiagramAnchor,
  type DiagramConnector,
  type DiagramDocument,
  type DiagramLayout,
  type DiagramLineLook,
  type DiagramShape,
  type DiagramSpacing,
  diagramPeople,
  diagramShapeOf,
  elementAnchor,
  type GapAxis,
  gapFromDrag,
  familyAnchor,
  familyLook,
  fitChart,
  fittingShift,
  type GridAxis,
  type GridCell,
  gridLineEdits,
  type GridShift,
  insertGapEdit,
  isDefaultDiagramSpacing,
  isNoShift,
  lineAnchor,
  MAX_SCALE,
  MIN_SCALE,
  nearestCell,
  nearestFreeCell,
  nextConnectorId,
  nextElementName,
  nudgeShift,
  placementFromDrag,
  removeDiagramConnectors,
  removeDiagramGroupAxis,
  removeDiagramGroupValue,
  setDiagramAnnotation,
  setDiagramFamilyGroup,
  setDiagramLineLabel,
  removeDiagramElement,
  renameDiagramElement,
  renameDiagramGroupAxis,
  renameDiagramGroupValue,
  sameAnchor,
  resizedSpacing,
  resizeFromDrag,
  rowPitch,
  shiftCell,
  viewForRect,
  zoomAt,
} from '@anytime-markdown/diagram-core';

import { createDiagramT, type DiagramT } from './i18n';
import { createAutomaticCache, deriveModel, type DiagramModel, groupBadgesOf, relatedTo } from './model';
import { createGroupDialogView } from './ui/groupDialog';
import { createLineLabelView } from './ui/lineLabels';
import { DIAGRAM_ROOT_CLASS, DIAGRAM_STYLES } from './theme/diagramStyles';
import type {
  DiagramElementAnnex,
  DiagramViewerHandle,
  DiagramViewerOptions,
  DiagramViewerUpdate,
} from './types';
import { createCellAdderView } from './ui/cellAdders';
import { createChromeView, createConfirmView, type LineSelection, RESET_LAYOUT } from './ui/chrome';
import { createLinkView, type LinkView } from './ui/connectors';
import { el, setAttr, setClass, svg } from './ui/dom';
import { createEdgeView, type EdgeView } from './ui/edges';
import { createGapView, nudgeStep } from './ui/gaps';
import { createGutterView } from './ui/gutter';
import { createMidpointView } from './ui/midpoints';
import { createMinimapView } from './ui/minimap';
import { createNodeView, type NodeView, type ResizeAxes } from './ui/nodes';
import { createViewControls } from './ui/viewControls';

const INITIAL_VIEW: ChartView = { x: 20, y: 20, scale: 0.7 };
/** キーボードで 1 回変える箱の大きさ（px）。Shift を添えると粗く変わる。 */
const RESIZE_PX = 4;
const COARSE_RESIZE_PX = 20;

/**
 * 押下を渡さない要素。ここで始めたドラッグは図の平行移動にしない。
 *
 * **枠の中へ浮かせた札（操作列・選択の区画）は、器ごと渡さない。** 操作要素の名前だけで見ると、
 * 札の中のボタンとボタンの**隙間**（余白・`gap`）が素通りし、操作しに行った指が図を動かし、
 * ついでに選択まで外す。札は図の上に載っているのだから、札のどこを押しても図への操作ではない。
 */
const interactive = (target: EventTarget | null): boolean =>
  target instanceof Element
  && target.closest('button, a, input, select, details, .anytime-diagram-toolbar, .anytime-diagram-panel') !== null;
/**
 * ホイールの拡大縮小を塞いでよい要素。**中でスクロール・値の増減が起こるものだけ**。
 *
 * `interactive` と分けてある。あちらは押下（ドラッグを始めさせない）の判定でボタンを塞ぐのが
 * 正しい。ホイールで同じ判定を使うと、縁のアイコンが並ぶ帯の上で拡大縮小が効かなくなる。
 */
const scrollable = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, select, details, textarea') !== null;

/**
 * 図の中身（札・線）の上か。地（何も無いところ）を押したときだけ選択を外すのに使う。
 *
 * 線は SVG の `path` なので `interactive`（`button` などの要素名で見る）には掛からない。
 * 判定を分けてあるのは、**線の上で押し始めた平行移動は今までどおり効かせたい**ため — 掛けて
 * しまうと線の上から図を動かせなくなる。
 */
const onDiagramItem = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[data-person], [data-connector], [data-family]') !== null;

export function mountDiagramViewer(container: HTMLElement, options: DiagramViewerOptions): DiagramViewerHandle {
  const doc = container.ownerDocument;
  let document_ = options.document;
  let editable = options.editable ?? false;
  /** 常に編集状態で出すか。切替と保存の口を図から外し、保存は宿主の `save()` が起こす。 */
  const alwaysEditing = options.alwaysEditing ?? false;
  let compact = options.compact ?? false;
  /**
   * 宿主が要素へ添えた項目群。**空の写しを既定にする**（`undefined` を配らない）。
   *
   * 図より後に読み終える宿主が居るので `update` でも差し替わる。鍵が無い要素は「添えるものが
   * 無い」であって、欠落ではない。
   */
  let elementAnnex: Readonly<Record<string, DiagramElementAnnex>> = options.elementAnnex ?? {};
  let t: DiagramT = createDiagramT(options.locale);
  /**
   * 文言の入口。**中身を差し替えても同じ関数**を配るために 1 枚かませる。
   *
   * `t` そのものを渡すと、locale を差し替えたときに作り直さなかった部品が古い辞書を掴んだまま
   * 残り、操作列だけ前の言語で出る。
   */
  const tr: DiagramT = (key, vars) => t(key, vars);

  let view: ChartView = INITIAL_VIEW;
  let selection: readonly string[] = [];
  let selectedFamilies: readonly number[] = [];
  /** 選んでいる接続線の id。家族の線とは同時に選ばない（見た目を変えられるのは手引きの線だけ）。 */
  let selectedConnectors: readonly string[] = [];
  /** 名札を書き換えている要素。`null` は書き換えていない状態。 */
  let renaming: string | null = null;
  /** 注記を書き換えている要素。名札とは別に持つ（同時に開かない）。 */
  let annotating: string | null = null;
  /**
   * 群を選び直している家族の番号。**人物ではなく家族**で持つ。
   *
   * 群は「その家族がどの巻・どの話に出てくるか」を指すので、書き換えの単位も家族になる
   * （同じ家族に出る他の人物の札も一緒に変わる）。
   */
  let editingGroups: number | null = null;
  /**
   * 字を書き換えている線。**家族の線と手で引いた線を 1 つの控えで持つ**（端の形が同じなので、
   * 2 つに分けると片方だけ畳み忘れて 2 か所に入力が出る）。
   */
  let labelling: DiagramAnchor | null = null;
  /**
   * 接続の始点として待ち受けている要素。
   *
   * 指でのドラッグと、キーボードでの「始点を押す → 終点を押す」の両方がこの 1 つを共有する。
   * 別々に持つと、指で引きかけたまま Tab へ移ったときに 2 つの始点が並び、どちらから線が
   * 出るのか画面から読めなくなる。
   */
  /** 始点として待ち受けている端。札の接続点と線の中点の**どちらも**ここへ入る。 */
  let connectSource: DiagramAnchor | null = null;
  let connectDrag:
    { readonly pointerId: number; readonly from: DiagramAnchor; x: number; y: number } | null = null;
  /** すき間を掴んでいる最中の状態。掴んだ瞬間の刻みと倍率を覚える。 */
  let gapDrag: {
    readonly pointerId: number;
    readonly axis: GapAxis;
    readonly origin: { readonly x: number; readonly y: number };
    readonly start: DiagramSpacing;
    readonly scale: number;
  } | null = null;
  /*
    常時編集の宿主は下書きを持った状態から始める。**`setDraft` を通さない**のは、開いただけで
    「下書きが変わった」と宿主へ伝えると、何も触っていない図に未保存の印が点くため。
  */
  let draft: DiagramDocument | null = alwaysEditing && editable ? document_ : null;
  let saving = false;
  let notice = '';
  let dragging = false;
  let frame = { width: 0, height: 0 };
  /**
   * 開いた直後の全体表示を済ませたか。
   *
   * 既定の倍率で開くと、幅 1 万 px の図は左上の数人しか見えない — 何の図なのか分からないまま
   * 「全体表示」を押させることになる。枠の**実寸が測れてから**でないと収まる倍率を出せない
   * ので、初回描画で片付けず、寸法が入った最初の描画で 1 度だけ寄せる。
   */
  let fitted = false;

  const automaticCache = createAutomaticCache();
  let model: DiagramModel = deriveModel({ document: document_, draft, automatic: automaticCache(document_) });

  // ---- DOM の骨組み -------------------------------------------------------
  const style = el(doc, 'style', { text: DIAGRAM_STYLES });
  const root = el(doc, 'div', { className: DIAGRAM_ROOT_CLASS });
  const viewport = el(doc, 'div', {
    className: 'anytime-diagram-viewport',
    attrs: { tabindex: '0', role: 'group' },
  });
  const surface = el(doc, 'div', { className: 'anytime-diagram-surface' });
  const gridSvg = svg(doc, 'svg', { class: 'anytime-diagram-grid', 'aria-hidden': 'true' });
  const gridPath = svg(doc, 'path');
  gridSvg.appendChild(gridPath);
  const edgesSvg = svg(doc, 'svg', { class: 'anytime-diagram-edges' });
  /**
   * 手で引いた線の層。家族の線とは**別の `<svg>`** に分ける。
   *
   * 同じ `<svg>` に混ぜると、家族の線に当てているスタイル（`fill: none` ほか）が端の印の
   * 塗りまで消す。層を分ければ、どちらの規則も相手を気にせず書ける。
   */
  const linksSvg = svg(doc, 'svg', { class: 'anytime-diagram-links' });
  /** 接続を引いている最中の仮の線。引いていない間は `d` を外して隠す。 */
  const previewPath = svg(doc, 'path', { class: 'link-preview' });
  linksSvg.appendChild(previewPath);
  /*
    面の重ね順。**すき間の取っ手は線より先（下）に置く。**

    後ろに置くと、すき間を横切る線が帯に隠れて選べない（実機で観測。要素から要素へ引いた線は
    ほぼ必ずすき間を通るので、ほとんどの線が選べなくなる）。線の当たり判定は経路の上だけ
    （`pointer-events: stroke`）なので、下に置いても帯は線の無いところで押下を受け取れる。

    取っ手を小さくして避ける手は採らない。線は箱の中心どうしを結ぶので、すき間の中の
    「線が通らない高さ」を決め打つことができない（箱の大きさも配置も変わる）。
  */
  surface.append(gridSvg);

  /*
    ミニマップ。**見え方の操作をこの中へ入れる**（ユーザー指示）。全体の絵と倍率を変える口は
    同じことを別の言い方で扱うので、離して置くと「いまどこを見ているか」を確かめてから拡大する
    のに視線が枠の端どうしを往復する。
  */
  const minimap = createMinimapView(doc, tr, {
    onFocusRect(rect) {
      view = viewForRect({ width: viewport.clientWidth, height: viewport.clientHeight }, rect, view.scale);
      paint();
    },
  });
  const viewControls = createViewControls(doc, tr, {
    onZoom: zoom,
    onFit: fit,
    onResetView: () => { view = INITIAL_VIEW; paint(); },
  });
  const chrome = createChromeView(doc, tr, {
    onLocate: locate,
    // 編集中かどうかは下書きの有無そのもの（`editing` は描画のたびに導く一時の値）。
    onToggleEditing: () => { if (draft === null) startEditing(); else stopEditing(); },
    onSave: () => { void save(); },
    onConfirm: (kind) => confirmView.show(kind),
    onClearSelection: () => { clearSelection(); },
    onResetSpacing: () => changeSpacing(DEFAULT_DIAGRAM_SPACING),
    onRenameSelected: () => { startRename(lastChosen()); },
    onAnnotateSelected: () => { startAnnotate(lastChosen()); },
    onRemoveSelected: () => { removeElement(lastChosen()); },
    onElementShape: changeShape,
    onLineLook: styleLine,
    onDeleteConnector: deleteConnector,
  });
  const confirmView = createConfirmView(doc, tr, (kind) => {
    // 「破棄」は編集そのものをやめ、「自動配置に戻す」は**配置だけ**を戻す（要素や線は残す）。
    setDraft(kind === 'discard' ? null : { ...(draft ?? document_), layout: RESET_LAYOUT });
    clearTransientSelection();
    paint();
  });
  const groupDialog = createGroupDialogView(doc, tr, {
    onGroupValue(axisId, value) {
      const index = editingGroups;
      if (index === null) return;
      updateDraft((current) => setDiagramFamilyGroup(current, index, axisId, value));
    },
    onAddAxis: () => updateDraft((current) => addDiagramGroupAxis(current, tr('newGroupAxis'))),
    onRenameAxis: (axisId, label) => renameGroupPart((current) =>
      renameDiagramGroupAxis(current, axisId, label), label),
    onRemoveAxis: (axisId) => updateDraft((current) => removeDiagramGroupAxis(current, axisId)),
    onAddValue: (axisId) => updateDraft((current) =>
      addDiagramGroupValue(current, axisId, tr('newGroupValue'))),
    onRenameValue: (axisId, value, label) => renameGroupPart((current) =>
      renameDiagramGroupValue(current, axisId, value, label), label),
    onRemoveValue: (axisId, value) => updateDraft((current) =>
      removeDiagramGroupValue(current, axisId, value)),
    onClose() {
      editingGroups = null;
      paint();
    },
  });
  /**
   * 線に添える字。**図の面へ載せる**（枠ではなく）。枠に貼ると図と一緒に動かないので、
   * 平行移動や拡大のたびに字と線が離れる（中点の取っ手と同じ理由）。
   */
  const lineLabels = createLineLabelView(doc, tr, {
    onStartLabel: startLineLabel,
    onCommitLabel(anchor, text) {
      labelling = null;
      updateDraft((current) => setDiagramLineLabel(current, anchor, text));
    },
    onCancelLabel() {
      labelling = null;
      paint();
    },
  });
  const gutter = createGutterView(doc, tr, { onEditGridLine: editGridLine });
  /*
    すき間の取っ手。**図の面へ載せる**（枠ではなく）。枠に貼ると図と一緒に動かないので、
    平行移動や拡大のたびに掴む場所と実際のすき間が離れる。
  */
  const gaps = createGapView(doc, tr, {
    onGapPointerDown: startGapDrag,
    onGapPointerMove: onGapMove,
    onGapPointerUp: onGapUp,
    onGapKey: onGapKeyDown,
  });
  const cellAdders = createCellAdderView(doc, tr, { onAddElement: addElement });
  /*
    線の中点の取っ手。**図の面（surface）へ載せる**（枠ではなく）。枠に貼ると図と一緒に
    動かないので、平行移動や拡大のたびに線と取っ手が離れる。
  */
  const midpoints = createMidpointView(doc, tr, {
    onConnectPointerDown: startConnect,
    onConnectPointerMove: onConnectMove,
    onConnectPointerUp: onConnectUp,
    onConnectToggle: toggleConnectSource,
    onEditLabel: startLineLabel,
  });
  surface.append(gaps.root, edgesSvg, linksSvg, midpoints.root, lineLabels.root);

  /**
   * 選択と線の区画を枠の左下へ重ねる入れ物。
   *
   * 枠の外の帯から移した。対象（選んだ札・選んだ線）と、それに効く操作を同じ場所へ置くため
   * — 見え方の操作を枠の中へ移したのと同じ理由。左下を選ぶのは、左上が操作列・右上が見え方の
   * 操作で埋まっており、上端と左端には行・列を増やす ＋ の帯が走っているため。
   */
  const panels = el(doc, 'div', { className: 'anytime-diagram-panels' });
  panels.append(chrome.selectionBar, chrome.connectorBar);

  // 縁のアイコンは**図より前に置く**。後ろに置くとタブ順が人物数ぶんの取っ手の後になり、
  // 最初の ＋ へ届くまで何百回も Tab を押すことになる。重ね順は z-index で決める。
  minimap.controls.appendChild(viewControls.root);
  // 操作列は**縁のアイコンより前**に置く。枠に入った浮きものの中でいちばん使うので、Tab の
  // 1 回目で届く場所に要る（後ろに置くと行・列の ＋ を全部越えてからになる）。
  viewport.append(
    chrome.toolbar, gutter.root, cellAdders.root, surface,
    minimap.root, panels, groupDialog.root, confirmView.root,
  );
  root.append(
    style, chrome.title, chrome.lead,
    chrome.blocked, chrome.error, viewport, chrome.note,
  );
  container.appendChild(root);

  const nodeViews = new Map<string, NodeView>();
  const edgeViews: EdgeView[] = [];
  const linkViews = new Map<string, LinkView>();

  // ---- 入力 ---------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let nodeDrag: { name: string; pointerId: number; offsetX: number; offsetY: number } | null = null;
  let sizeDrag: {
    readonly pointerId: number; readonly x: number; readonly y: number;
    readonly start: DiagramSpacing; readonly scale: number; readonly anchor: GridCell; readonly axes: ResizeAxes;
  } | null = null;

  const onWheel = (event: WheelEvent): void => {
    if (scrollable(event.target)) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    view = zoomAt(view, Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.004),
      event.clientX - rect.left, event.clientY - rect.top);
    paint();
  };
  viewport.addEventListener('wheel', onWheel, { passive: false });

  viewport.addEventListener('keydown', (event) => {
    if (event.target !== viewport) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.25); }
    else if (event.key === 'Home') { event.preventDefault(); fit(); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      view = {
        ...view,
        x: view.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0),
        y: view.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0),
      };
      paint();
    }
  });

  /*
    Delete で消す。**上の keydown とは別に張る。**

    あちらは `event.target !== viewport` で弾いており、図の見え方（拡大・平行移動）だけを扱う。
    消す操作の対象は選んだ札・選んだ線で、そのとき焦点は札の取っ手や線そのものに在って viewport
    には無い。同じ handler へ足すと、選んだ直後の Delete が一度も効かない。

    字を打っている最中は横取りしない。横取りすると、名前を打ち直している途中の Delete が
    1 文字ではなく要素そのものを消す。
  */
  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete') return;
    if (typing(event.target)) return;
    if (draft === null || saving) return;
    if (!deleteSelection()) return;
    event.preventDefault();
    event.stopPropagation();
  });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || interactive(event.target)) return;
    viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // **ここでは掴まない**（`setPointerCapture` を呼ばない）。指が動いてからにする — 下の
    // `beginPan` を参照。
    // 図の地の上を押したら、線の選択は外す。線は自分を押しても外せる場所を持たないので、
    // 地を押して外せないと、選んだ線の設定が出たまま片付かない。
    if (!onDiagramItem(event.target)) {
      selectedConnectors = [];
      selectedFamilies = [];
      // 閲覧中の要素の選択も地で外す。閲覧中は選択の帯（解除の口）を出していないので、
      // ここで外せないと、絞り込んだ図を元へ戻す手段が画面から消える。
      if (draft === null) selection = [];
      paint();
    }
  });
  viewport.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;
    beginPan(event, previous);
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (before.length === 2 && after.length === 2) {
      const [a, b] = before as [{ x: number; y: number }, { x: number; y: number }];
      const [c, d] = after as [{ x: number; y: number }, { x: number; y: number }];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < 1) return;
      const rect = viewport.getBoundingClientRect();
      const next = zoomAt(view, Math.hypot(c.x - d.x, c.y - d.y) / distance,
        (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      view = { ...next, x: next.x + (c.x + d.x - a.x - b.x) / 2, y: next.y + (c.y + d.y - a.y - b.y) / 2 };
    } else if (after.length === 1) {
      view = { ...view, x: view.x + event.clientX - previous.x, y: view.y + event.clientY - previous.y };
    }
    paint();
  });
  /**
   * 平行移動を**指が動いてから**始める。押した瞬間には掴まない。
   *
   * 押下と同時に `setPointerCapture` を呼ぶと、以後のポインタ事象が枠へ付け替えられ、離した
   * ときの `click` も枠に届く — **押した線や札そのものの `click` が発火しない**。線を押しても
   * 設定の区画が出ない不具合はこれだった（引いた直後だけ出るのは、引いた側で選んでいたため）。
   *
   * `interactive` の判定を広げる手もあるが、それだと線の上から図を平行移動できなくなる。
   * 閾値を置けば「押しただけ」と「掴んで動かした」を分けられ、どちらも失わない。
   */
  const DRAG_THRESHOLD_PX = 3;
  function beginPan(event: PointerEvent, from: { x: number; y: number }): void {
    if (dragging) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) < DRAG_THRESHOLD_PX) return;
    dragging = true;
    setClass(viewport, 'is-dragging', true);
    // 掴むのはここ。掴んでおかないと、枠の外へ指が出た瞬間に平行移動が止まる。
    if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
  }

  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0 && dragging;
    setClass(viewport, 'is-dragging', dragging);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('lostpointercapture', (event) => {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0 && dragging;
    setClass(viewport, 'is-dragging', dragging);
  });

  // 枠の内寸。縁のアイコンのうち**画面に映るもの**を選ぶのに要る。`0` は未計測を表し、
  // そのときは絞らない（絞ると計測が届くまでアイコンが 1 つも出ない）。
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    frame = { width: viewport.clientWidth, height: viewport.clientHeight };
    paint();
  });
  observer?.observe(viewport);
  frame = { width: viewport.clientWidth, height: viewport.clientHeight };

  // ---- 操作 ---------------------------------------------------------------
  function zoom(factor: number): void {
    view = zoomAt(view, factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
    paint();
  }

  function fit(): void {
    view = fitChart(viewport.clientWidth, viewport.clientHeight, model.surface.width, model.surface.height);
    paint();
  }

  function locate(name: string): void {
    selection = name === '' ? [] : [name];
    const node = model.byName.get(name);
    if (node !== undefined) {
      view = {
        scale: 1,
        x: viewport.clientWidth / 2 - node.x - model.spacing.nodeWidth / 2,
        y: viewport.clientHeight / 2 - node.y - model.spacing.nodeHeight / 2,
      };
    }
    paint();
  }

  function setDraft(next: DiagramDocument | null): void {
    draft = next;
    options.onDraftChange?.(next);
  }

  /** 編集を抜けるとき・図を差し替えるときに畳む、その場かぎりの選択。 */
  /**
   * 選びを外し、宿主へも伝える。
   *
   * 伝えないと、図の外の表示を選びに合わせている宿主（anytime-travel は選んだ人物へ地図を
   * 寄せる）が**一度寄せた表示を戻す手段を持たない**。`onSelect` は片道ではなく、選びが
   * 無くなったことも渡す契約なので、選びを空にする経路はすべてここを通す。
   */
  function clearSelection(): void {
    const had = selection.length > 0;
    selection = [];
    paint();
    if (had) options.onSelect?.(null, false);
  }

  function clearTransientSelection(): void {
    const had = selection.length > 0;
    selection = [];
    if (had) options.onSelect?.(null, false);
    selectedFamilies = [];
    selectedConnectors = [];
    renaming = null;
    annotating = null;
    editingGroups = null;
    labelling = null;
    connectSource = null;
    connectDrag = null;
  }

  function startEditing(): void {
    setDraft(document_);
    notice = '';
    // 選択は編集ごとに空から始める。前の編集の選択が残っていると、最初の矢印キーが覚えのない
    // 人物まで動かす。
    clearTransientSelection();
    paint();
  }

  /** 編集を終う。未保存の変更があれば確かめる。 */
  function stopEditing(): void {
    if (model.changed) { confirmView.show('discard'); return; }
    setDraft(null);
    clearTransientSelection();
    paint();
  }

  /**
   * 下書きを 1 段進める。編集に入っていない状態からは触らない（掴めるのは編集中だけ）。
   *
   * **保存中も触らない。** 保存は宿主への往復（webview → 拡張 → ディスク）なので、その間に指が
   * 動くのは普通に起こる。門が無かった頃は、保存中に動かした札が完了時の `setDraft(null)` で
   * 黙って元へ戻っていた（保存された図にも入らない）。門をここへ 1 つ置くと、配置・要素・線・
   * 群・注記のすべての経路が同じ門を通る。
   */
  function updateDraft(next: (current: DiagramDocument) => DiagramDocument): void {
    if (draft === null || saving) return;
    setDraft(next(draft));
    paint();
  }

  /**
   * 下書きの**配置だけ**を 1 段進める。
   *
   * 配置を触る操作（掴んで動かす・矢印キー・行列の増減）は指の動きごとに走る。図の全体を
   * 組み直す口と分けておくと、そのたびに家族や線の配列まで作り直さずに済む（作り直すと
   * 自動配置の記憶が毎フレーム外れる）。
   */
  function updateLayout(next: (current: DiagramLayout) => DiagramLayout): void {
    updateDraft((current) => ({ ...current, layout: next(current.layout) }));
  }

  /**
   * 刻みを差し替える。既定と同じ値なら**持たない**。
   *
   * 持つと、既定と同じ図なのに「未保存の変更あり」になり、保存すると既定の値が焼き付く。
   */
  function changeSpacing(next: DiagramSpacing): void {
    updateLayout((current) => {
      if (!isDefaultDiagramSpacing(next)) return { ...current, spacing: next };
      const { spacing: _dropped, ...rest } = current;
      return rest;
    });
  }

  /**
   * いまその人物が載っている升目。図に居なければ `null`。
   *
   * 知らない名前へ原点（0, 0）を返さない。返すと、図に居ない人物を「原点に居る実在の人物」として
   * 扱い、実在しない差分を書き込んだうえ群が左上へ動けなくなる。
   */
  function currentCell(name: string): GridCell | null {
    const node = model.byName.get(name);
    return node === undefined ? null : { column: node.column, row: node.row };
  }

  function cellsOf(names: readonly string[]): readonly GridCell[] {
    return names.flatMap((name) => {
      const cell = currentCell(name);
      return cell === null ? [] : [cell];
    });
  }

  /**
   * それらの人物を除いた占有。掴んでいる本人の升目を「埋まっている」と数えると、真下や真横へ
   * 寄せられない。**名前が一致したときだけ外す** — 升目で引いて無条件に外すと、その升目に別の
   * 人物も居た場合にその人の上へ重ねられる。
   */
  function occupiedExcept(names: readonly string[]): ReadonlySet<string> {
    const without = new Set(model.occupied);
    for (const name of names) {
      const cell = currentCell(name);
      if (cell === null) continue;
      const key = cellKey(cell);
      if (model.occupants.get(key) === name) without.delete(key);
    }
    return without;
  }

  /** 実際に選ばれている人物。**図に居る名前だけ**に絞る（別の図の名前を持ち越さない）。 */
  function chosen(): readonly string[] {
    return selection.filter((name) => model.byName.has(name));
  }

  /**
   * 字を打っている最中か。Delete を横取りしてよいかの判定。
   *
   * 種別を並べるだけにしない。`contenteditable` の中も字を打つ場所である（いまは無いが、注記を
   * その場で書けるようにした日に、この判定だけが取り残されると打ち間違いが要素の消去になる）。
   */
  function typing(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase());
  }

  /**
   * 選んでいるものを消す。**消せた（または断った）ら真**で、呼んだ側が既定の動作を止める。
   *
   * 線が選ばれていれば線を優先する。線を選ぶと札は薄くなる（`is-node-dimmed`）ので、画面が
   * 「いまの対象は線だ」と示している。そこで札を消すと、示していたものと消えたものが食い違う。
   *
   * 札は**ちょうど 1 つのときだけ**消す（取り除きのアイコンと同じ条件）。2 つ以上へ同時に効かせる
   * と、どれが消えたのか操作の後から分からない。
   */
  function deleteSelection(): boolean {
    if (selectedConnectors.length > 0) {
      deleteConnector();
      return true;
    }
    if (selectedFamilies.length > 0) {
      // 家族の線を消すことは家族そのものを消すこと。取り除きのアイコンを出していないのと同じ
      // 理由で断るが、**黙って何も起きない**のは避ける（キーには隠す口が無く、理由が画面に出ない）。
      notice = tr('familyLineNotDeletable');
      paint();
      return true;
    }
    if (chosen().length !== 1) return false;
    removeElement(lastChosen());
    return true;
  }

  /** 最後に選んだ 1 人。帯の操作（改名・取り除き）はこれを対象にする。 */
  function lastChosen(): string {
    const picked = chosen();
    return picked[picked.length - 1] ?? '';
  }

  /**
   * いっしょに動かす人物。掴んだ人物が選択に入っていれば選択全体、そうでなければ 1 人。
   *
   * 掴んだ人物を選択へ足さないのは、選択の外を掴む操作を「選び直し」として使えるようにするため。
   */
  function movingNames(name: string): readonly string[] {
    const picked = chosen();
    return picked.includes(name) && picked.length > 1 ? picked : [name];
  }

  /**
   * 何人かをまとめて同じ差だけ動かす。
   *
   * 差が 0 なら**何も書かない**。書くと、動けなかった人物まで「手で置いた」印が付き、以後
   * データを足しても自動配置へ追従しなくなる。
   */
  function moveBy(names: readonly string[], shift: GridShift): void {
    if (isNoShift(shift)) return;
    updateLayout((current) => {
      const next = { ...current.placements };
      for (const name of names) {
        const cell = currentCell(name);
        if (cell !== null) next[name] = shiftCell(cell, shift);
      }
      return { ...current, placements: next };
    });
  }

  function togglePick(name: string): void {
    selection = selection.includes(name) ? selection.filter((item) => item !== name) : [...selection, name];
    paint();
  }

  function nudgeCells(name: string, columns: number, rows: number): void {
    const names = movingNames(name);
    moveBy(names, nudgeShift(model.extent, occupiedExcept(names), cellsOf(names), { columns, rows }));
  }

  /** 1 人を自動配置へ戻す。鍵ごと落とすので、以後はデータ側の変化に追従する。 */
  function releasePlacement(name: string): void {
    if (draft === null || !(name in draft.layout.placements)) return;
    updateLayout((current) => {
      const placements = { ...current.placements };
      delete placements[name];
      return { ...current, placements };
    });
  }

  // ---- 要素と接続線 -------------------------------------------------------
  /** いま図に居る要素の名前（下書き中は下書きのもの）。 */
  const peopleNow = (): ReadonlySet<string> => diagramPeople(model.source.families, model.source.nodes);

  /**
   * 空いた升目へ要素を 1 つ足し、**そのまま名札の書き換えに入る**。
   *
   * 仮の名前で置いて終わりにしない。名前は要素の同一性そのもので、`要素 1` が並んだ図は
   * どの升目のことを話しているのか指せなくなる（配置差分も線もその名前で結ばれる）。
   */
  function addElement(cell: GridCell): void {
    if (draft === null || saving) return;
    const name = nextElementName(peopleNow(), tr('newElement'));
    updateDraft((current) => ({
      ...current,
      nodes: [...current.nodes, name],
      layout: { ...current.layout, placements: { ...current.layout.placements, [name]: cell } },
    }));
    renaming = name;
    selection = [name];
    paint();
  }

  /**
   * 名札を書き換える。**空の名前と、すでに在る名前は受けない。**
   *
   * 受けると 2 つの要素が 1 つに畳まれ、取り消しが利かない（畳まれた側の配置も線も相手のものに
   * なる）。断ったときは書き換えを続けさせる — 打った字を捨てて閉じると、何が悪かったのか
   * 分からないまま入力からやり直すことになる。
   */
  function commitRename(from: string, to: string): void {
    const next = to.trim();
    if (next === from || next === '') { renaming = null; paint(); return; }
    if (peopleNow().has(next)) {
      notice = tr('renameTaken', { name: next });
      paint();
      return;
    }
    notice = '';
    renaming = null;
    selection = selection.map((name) => (name === from ? next : name));
    updateDraft((current) => renameDiagramElement(current, from, next));
  }

  /**
   * その札の手前へ空きを 1 つ割り込ませ、同じ列（行）の**次の空きまで**を押しのける。
   *
   * 行・列を 1 本まるごと挿入する縁の ＋ とは別物。あちらは図の全体が動くので、「この札の上に
   * 隙間が欲しい」だけのときに関係のない列まで組み替わる。
   *
   * できないとき（押す先が詰まっている）は**理由を出す**。黙って何も起きないと、押せるボタンが
   * 効いていないのか、そもそも効く条件を満たしていないのかを画面から区別できない。
   */
  function insertGap(name: string, axis: GridAxis): void {
    if (draft === null || saving) return;
    const cell = currentCell(name);
    if (cell === null) return;
    const limit = {
      column: cellLimit(columnPitch(model.spacing)),
      row: cellLimit(rowPitch(model.spacing)),
    };
    const next = insertGapEdit(model.chart.nodes, draft.layout.placements, cell, axis, limit, model.chart.automatic);
    if (next === null) {
      notice = tr(axis === 'row' ? 'insertAboveBlocked' : 'insertLeftBlocked', { name });
      paint();
      return;
    }
    notice = '';
    updateLayout((current) => ({ ...current, placements: next }));
  }

  /** 名札の書き換えに入る。 */
  function startRename(name: string): void {
    if (draft === null || saving || name === '') return;
    renaming = name;
    // 名札と注記を同時に開かない。開くと札の中に入力が 2 つ並び、どちらを打っているのか
    // 見た目で分からなくなる。
    annotating = null;
    notice = '';
    paint();
  }

  /**
   * 群を編集するダイアログを開く。**軸を 1 本も持たない図でも開く。**
   *
   * かつては軸が無ければ理由を出して開かなかった。ダイアログが語彙そのもの（軸と選択肢）を
   * 編集できるようになった以上、軸が無い図こそ**ここから作り始める**場所になる。断ると、
   * ファイルを手で書くほかに軸を足す道が無い状態へ戻る。
   */
  function startGroups(name: string, family: number): void {
    if (draft === null || saving) return;
    editingGroups = family;
    renaming = null;
    annotating = null;
    labelling = null;
    notice = '';
    selection = [name];
    paint();
  }

  /**
   * 群の名前（軸・選択肢）を書き換える。**空の名前は断って理由を出す。**
   *
   * 黙って元へ戻さない。入力がひとりでに戻るだけだと、断られたのか打ち間違えたのかが
   * 画面から読めない（核の側も空では書き換えないので、二重の守りになる）。
   */
  function renameGroupPart(next: (current: DiagramDocument) => DiagramDocument, label: string): void {
    if (label.trim() === '') {
      notice = tr('groupLabelRequired');
      paint();
      return;
    }
    notice = '';
    updateDraft(next);
  }

  /**
   * 線に添える字の書き換えに入る。**編集中だけ**（閲覧中は図の中身を変えられない）。
   *
   * 家族の線と手で引いた線を同じ口で受ける。どちらも端の形（`DiagramAnchor`）が同じなので、
   * 入口を 2 つに分けると片方だけ畳み忘れる。
   */
  function startLineLabel(anchor: DiagramAnchor): void {
    if (draft === null || saving) return;
    labelling = anchor;
    renaming = null;
    annotating = null;
    // 引きかけの線は畳む。中点の取っ手を叩くと 1 度目の押下で始点が立つので、畳まないと
    // 字を打っている間じゅう「どこかの端が待ち受けている」状態が図に残る。
    connectSource = null;
    notice = '';
    paint();
  }

  function startAnnotate(name: string): void {
    if (draft === null || saving || name === '') return;
    annotating = name;
    renaming = null;
    notice = '';
    paint();
  }

  /**
   * 注記を確定する。**空にしたら注記そのものが落ちる**（`setDiagramAnnotation`）。
   *
   * 名札の書き換えと違って断る条件が無い。注記は図の同一性に関わらないので、重なっても
   * 空でも困らない。
   */
  function commitAnnotate(name: string, text: string): void {
    annotating = null;
    updateDraft((current) => setDiagramAnnotation(current, name, text));
  }

  /**
   * 要素を 1 つ取り除く。**家族に出る人物も取り除ける。**
   *
   * ついでに何が変わったかを知らせる。家族に出る人物を消すと、その人が居た家族と線も消え、
   * その家族にしか出てこなかった相手は名前だけの要素として残る — 押した人が図を見比べて
   * 気づくのでは遅い（取り消しは編集の破棄しかない）。
   */
  function removeElement(name: string): void {
    if (draft === null || saving) return;
    const result = removeDiagramElement(draft, name);
    if (!result.removed) return;
    selection = selection.filter((item) => item !== name);
    if (connectSource !== null && sameAnchor(connectSource, elementAnchor(name))) connectSource = null;
    notice = result.droppedFamilies === 0
      ? ''
      : tr('removedWithFamilies', {
        name,
        families: result.droppedFamilies,
        rescued: result.rescued.length === 0 ? '—' : result.rescued.join('・'),
      });
    updateDraft(() => result.document);
  }

  /**
   * 線を 1 本引く。**同じ向きの同じ組は 2 本引かない。**
   *
   * 重ねると 2 本目は 1 本目の真下に隠れ、選んでいるつもりの線と見えている線が食い違う。
   * 逆向き（`to → from`）は別の線として認める — 端の印を左右で付け替えたい場合がある。
   */
  function connect(from: DiagramAnchor, to: DiagramAnchor): void {
    if (draft === null || saving || sameAnchor(from, to)) return;
    if (!anchorExists(from) || !anchorExists(to)) return;
    if (draft.connectors.some((item) => sameAnchor(item.from, from) && sameAnchor(item.to, to))) return;
    const connector: DiagramConnector = {
      id: nextConnectorId(draft.connectors),
      ...DEFAULT_CONNECTOR_LOOK,
      from,
      to,
      end: 'arrow',
    };
    selectedConnectors = [connector.id];
    selectedFamilies = [];
    updateDraft((current) => ({ ...current, connectors: [...current.connectors, connector] }));
  }

  /**
   * 選んでいる線の見た目を変える。**手で引いた線と家族の線の両方**を受ける。
   *
   * 家族の線は、上書きが無ければ種別から決まる既定（`familyLook`）を土台にして書き込む。
   * 部分的な上書きにすると、「既定に戻した」と「その項目を書き忘れた」がファイル上で区別
   * できなくなる。
   */
  /**
   * 選んでいる線の見た目を変える。**選んだぶん全部に同じ差し替えを当てる。**
   *
   * 手で引いた線と家族の線が混ざっていても両方に当てる。区画に出ている値は最後に選んだ 1 本の
   * ものだが、変えた項目だけを差し替えるので、触っていない項目は各線のものが残る。
   */
  function styleLine(patch: Partial<DiagramLineLook>): void {
    const ids = new Set(selectedConnectors);
    const families = new Set(selectedFamilies);
    if (ids.size === 0 && families.size === 0) return;
    updateDraft((current) => ({
      ...current,
      connectors: current.connectors.map((item) => (ids.has(item.id) ? { ...item, ...patch } : item)),
      families: current.families.map((family, at) =>
        (families.has(at) ? { ...family, look: { ...familyLook(family), ...patch } } : family)),
    }));
  }

  /**
   * 選んでいる 1 つの要素の形を変える。**既定（四角）へ戻したら鍵ごと落とす。**
   *
   * 既定を書き残すと、形を試してから戻しただけの図に `shapes` の行が残る（線の見た目で
   * 既定と同じ `look` を持たないのと同じ決まり）。
   */
  function changeShape(shape: DiagramShape): void {
    const name = lastChosen();
    if (name === '') return;
    updateDraft((current) => {
      const shapes = { ...current.shapes };
      if (shape === DEFAULT_DIAGRAM_SHAPE) delete shapes[name];
      else shapes[name] = shape;
      return { ...current, shapes };
    });
  }

  /**
   * 選んでいる線を消す。**その中点にぶら下がっていた線も一緒に消える。**
   *
   * 残すと端の見つからない線が図に積もり、描画側は黙って描かないので「ファイルには在るが
   * 永久に見えない線」になる（`removeDiagramConnectors` が推移的に落とす）。
   */
  function deleteConnector(): void {
    const ids = selectedConnectors;
    if (ids.length === 0) return;
    selectedConnectors = [];
    updateDraft((current) => ({
      ...current,
      connectors: removeDiagramConnectors(current.connectors, ids),
    }));
  }

/**
 * 押した線を選択へ反映する。**修飾キーを添えた押下だけが足す・外す**で、素の押下は選び直し。
 *
 * 素の押下で切り替え（同じものをもう一度押すと外れる）にしない。選んだつもりで押した 2 回目に
 * 設定の区画が消える。外すのは図の地を押すか、修飾キーを添えてもう一度押したとき。
 */
  function pickLine<T>(current: readonly T[], pressed: T, additive: boolean): readonly T[] {
    if (!additive) return [pressed];
    return current.includes(pressed)
      ? current.filter((item) => item !== pressed)
      : [...current, pressed];
  }

  /**
   * その端が図に在るか。**要素は図に出ているか、線は描けているか。**
   *
   * 線は「ファイルに在るか」ではなく「いま描けているか」で見る。端が迷子で描かれていない線の
   * 中点へ結ばせると、どこにも取り付いていない線が 1 本増える。
   */
  function anchorExists(anchor: DiagramAnchor): boolean {
    if (anchor.kind === 'element') return peopleNow().has(anchor.name);
    // 線と家族の結び目は「いま取っ手が出ているか」で見る。取っ手の出ていない所へ結ばせると、
    // どこにも取り付いていない線が 1 本増える。
    return model.midpoints.some((item) => sameAnchor(item.anchor, anchor));
  }

  /**
   * 指が差している端。**札か、線の中点の取っ手。**
   *
   * 座標から最寄りの線を探さない。線どうしが交わっている所ではどちらを掴んだか決められず、
   * 見えている取っ手と結ばれる相手が食い違う。取っ手そのものが DOM に居るので、それを読む。
   */
  function anchorUnder(clientX: number, clientY: number): DiagramAnchor | null {
    const element = doc.elementFromPoint(clientX, clientY);
    if (!(element instanceof Element)) return null;
    const handle = element.closest('[data-line-anchor]');
    if (handle !== null) {
      // 鍵から端を組み立て直さない。組み立て直すと、鍵の作り方（`anchorKey`）を変えた日に
      // ここだけが古い綴りのまま残る。鍵で引き当てて、端そのものを model から取る。
      const key = handle.getAttribute('data-line-anchor') ?? '';
      return model.midpoints.find((item) => item.key === key)?.anchor ?? null;
    }
    const node = element.closest('[data-person]');
    const name = node?.getAttribute('data-person');
    return name === null || name === undefined ? null : elementAnchor(name);
  }

  /** 接続の始点を押した／待ち受け中の始点と結んだ。キーボードと指の両方がここへ来る。 */
  function toggleConnectSource(anchor: DiagramAnchor): void {
    if (draft === null || saving) return;
    if (connectSource !== null && !sameAnchor(connectSource, anchor)) {
      const from = connectSource;
      connectSource = null;
      connect(from, anchor);
      return;
    }
    connectSource = connectSource !== null && sameAnchor(connectSource, anchor) ? null : anchor;
    paint();
  }

  /**
   * 始点を押した。**札の接続点と線の中点の取っ手が同じここへ来る。**
   *
   * 2 か所に同じ処理を置かない。置くと、待ち受け中の扱い（押下を「結ぶ」と読む）や捕捉の解放を
   * 片方にだけ足した日に、線からの接続だけが指から外れる。
   */
  function startConnect(event: PointerEvent, anchor: DiagramAnchor): void {
    if (draft === null || saving || event.button !== 0) return;
    // 待ち受け中の始点があるなら、この押下は「結ぶ」の意味になる。新しい始点で上書きしない。
    if (connectSource !== null && !sameAnchor(connectSource, anchor)) {
      const from = connectSource;
      connectSource = null;
      connect(from, anchor);
      return;
    }
    const target = event.currentTarget;
    if (target instanceof Element) target.setPointerCapture(event.pointerId);
    const rect = viewport.getBoundingClientRect();
    const point = chartPoint(view, rect, event.clientX, event.clientY);
    connectSource = anchor;
    connectDrag = { pointerId: event.pointerId, from: anchor, x: point.x, y: point.y };
    paint();
  }

  /**
   * すき間を掴んだ。**掴んだ瞬間の刻みと倍率を覚える。**
   *
   * いまの値へ 1 フレームぶんの差を足し続けない。範囲の端で止まった後に指を戻したとき、
   * 止まっていた間の差が消えて取っ手が指から離れる（箱の大きさの取っ手と同じ理由）。
   */
  function startGapDrag(event: PointerEvent, axis: GapAxis): void {
    if (draft === null || saving || event.button !== 0) return;
    const target = event.currentTarget;
    if (target instanceof Element) target.setPointerCapture(event.pointerId);
    gapDrag = {
      pointerId: event.pointerId,
      axis,
      origin: { x: event.clientX, y: event.clientY },
      start: model.spacing,
      scale: view.scale,
    };
  }

  function onGapMove(event: PointerEvent): void {
    if (gapDrag === null || gapDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    changeSpacing(gapFromDrag({
      start: gapDrag.start,
      pointer: { x: event.clientX - gapDrag.origin.x, y: event.clientY - gapDrag.origin.y },
      scale: gapDrag.scale,
      axis: gapDrag.axis,
    }));
  }

  function onGapUp(event: PointerEvent): void {
    if (gapDrag === null || gapDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const target = event.currentTarget;
    if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    gapDrag = null;
  }

  /** 矢印キーでのすき間の増減。指の操作と同じ関数へ落として、刻みと範囲の扱いを 1 か所にする。 */
  function onGapKeyDown(event: KeyboardEvent, axis: GapAxis): void {
    if (draft === null || saving) return;
    const step = nudgeStep(event, axis);
    if (step === null) return;
    event.preventDefault();
    event.stopPropagation();
    changeSpacing(gapFromDrag({
      start: model.spacing,
      pointer: axis === 'column' ? { x: step, y: 0 } : { x: 0, y: step },
      scale: 1,
      axis,
    }));
  }

  function onConnectMove(event: PointerEvent): void {
    if (connectDrag === null || connectDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = viewport.getBoundingClientRect();
    const point = chartPoint(view, rect, event.clientX, event.clientY);
    connectDrag = { ...connectDrag, x: point.x, y: point.y };
    paint();
  }

  function onConnectUp(event: PointerEvent): void {
    const drag = connectDrag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const target = event.currentTarget;
    if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    connectDrag = null;
    const to = anchorUnder(event.clientX, event.clientY);
    // 相手の上で離していなければ**待ち受けたまま**にする（押しただけの操作＝始点の指定）。
    if (to === null || sameAnchor(to, drag.from)) { paint(); return; }
    connectSource = null;
    connect(drag.from, to);
  }

  /** 端がいま図のどこに在るか。引きかけの線の付け根を描くのに要る。 */
  function anchorPoint(anchor: DiagramAnchor): { readonly x: number; readonly y: number } | null {
    if (anchor.kind === 'element') {
      const node = model.byName.get(anchor.name);
      return node === undefined
        ? null
        : { x: node.x + model.spacing.nodeWidth / 2, y: node.y + model.spacing.nodeHeight / 2 };
    }
    const midpoint = model.midpoints.find((item) => sameAnchor(item.anchor, anchor));
    return midpoint === undefined ? null : { x: midpoint.x, y: midpoint.y };
  }

  /**
   * 図の縁のアイコンを押したとき。**押した瞬間に差分を組み立て、置ける形でなければ何もしない。**
   *
   * `gridLineEdits` は保存の入口と同じ検査（件数・番号の上限・重なり）を持つので、ここを通った
   * 差分は必ず保存できる。
   */
  function editGridLine(axis: GridAxis, index: number, kind: 'insert' | 'remove'): void {
    if (draft === null) return;
    const limit = {
      column: cellLimit(columnPitch(model.spacing)),
      row: cellLimit(rowPitch(model.spacing)),
    };
    const edits = gridLineEdits(
      model.chart.nodes, draft.layout.placements, axis, index, limit, model.chart.automatic,
    );
    const next = kind === 'insert' ? edits.insert : edits.remove;
    if (next === null) return;
    updateLayout((current) => ({ ...current, placements: next }));
  }

  async function save(): Promise<void> {
    // 門はここに置く。図の中の保存ボタンの `disabled` に頼ると、そのボタンを出さない
    // `alwaysEditing` の宿主（自分の「適用」から呼ぶ）では門が 1 つも無くなり、連打した
    // 2 本目が保存中の `updateDraft` 抑止を素通りする。
    if (options.onSave === undefined || draft === null || saving) return;
    saving = true;
    notice = '';
    paint();
    try {
      const saved = draft;
      // 宿主が実際に書いた形（検証で正規化された図）を返してきたらそれを採る。返さなければ
      // 渡した下書きのまま。返り値を無視すると、正規化で変わった図を「未保存」として持ち続ける。
      const persisted = await options.onSave(saved);
      const kept = persisted ?? saved;
      /*
        常時編集では編集を抜けない（抜ける口が画面に無い）。保存した図を次の土台に据えて
        下書きを置き直す — 据え直さないと「変更あり」が落ちず、宿主の未保存の印も
        「自動配置に戻す」も保存のたびに点いたまま残る。
      */
      if (alwaysEditing) {
        document_ = kept;
        setDraft(kept);
      } else {
        setDraft(null);
      }
      clearTransientSelection();
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
      paint();
    }
  }

  // ---- 人物の箱と取っ手 ---------------------------------------------------
  const nodeCallbacks = {
    onNodePointerDown(event: PointerEvent, name: string): void {
      if (draft === null || event.button !== 0 || interactive(event.target)) return;
      // 背景のドラッグ（図の平行移動）へ渡さない。開始点が人物の箱なら意味は「人物を動かす」の 1 つ。
      event.stopPropagation();
      // 修飾キー付きの押下は**選択の加除だけ**を行い、掴まない。掴めるようにすると、選び足す
      // つもりの 1 px の手ぶれでその人物だけが動く。
      if (event.shiftKey || event.ctrlKey || event.metaKey) { togglePick(name); return; }
      const element = nodeViews.get(name)?.root;
      element?.setPointerCapture(event.pointerId);
      const node = model.byName.get(name);
      if (node === undefined) return;
      const rect = viewport.getBoundingClientRect();
      const point = chartPoint(view, rect, event.clientX, event.clientY);
      nodeDrag = { name, pointerId: event.pointerId, offsetX: point.x - node.x, offsetY: point.y - node.y };
      // 選択の中を掴んだときは選択を保つ（群ごと動かす）。外を掴んだら選び直しとして 1 人にする。
      if (!selection.includes(name)) { selection = [name]; paint(); }
    },
    onNodePointerMove(event: PointerEvent): void {
      const drag = nodeDrag;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const names = movingNames(drag.name);
      const from = currentCell(drag.name);
      if (from === null) return;
      const free = occupiedExcept(names);
      const rect = viewport.getBoundingClientRect();
      const placed = placementFromDrag(view, rect, event.clientX, event.clientY,
        { x: drag.offsetX, y: drag.offsetY });
      /*
        掴んだ人物の行き先を先に決め、そこまでの差を**全員へ同じだけ**当てる。1 人ずつ最寄りの
        空きへ寄せると、避けた人だけが別の向きへ逃げて選んだ並びが崩れる。

        群のときは**指が差した升目そのもの**を狙う（空きへ寄せない）。寄せると、群全体の行き先が
        指の位置と無関係にずれ、置けなければさらに別の差へ飛ぶ。
      */
      const to = names.length > 1
        ? nearestCell(model.spacing, model.extent, placed)
        : nearestFreeCell(model.spacing, model.extent, free, placed, from);
      moveBy(names, fittingShift(model.extent, free, cellsOf(names),
        { columns: to.column - from.column, rows: to.row - from.row }));
    },
    onNodePointerUp(event: PointerEvent): void {
      if (nodeDrag?.pointerId !== event.pointerId) return;
      const element = nodeViews.get(nodeDrag.name)?.root;
      nodeDrag = null;
      if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    },
    onSelectNode(name: string, additive: boolean): void {
      /*
        **閲覧中だけ**受ける。編集中の選択は押下（ドラッグの始まり）が受け持っており、両方で
        受けると、掴んで動かし終えた指が離れた瞬間にもう一度選び直しが走る。

        閲覧中は掴んで動かせないので、押し終わり（click）で受けてよい。押下で受けると、札の上から
        始めた平行移動が選択に化ける。
      */
      if (draft !== null) return;
      if (additive) togglePick(name);
      else { selection = [name]; paint(); }
      // 押した名前ではなく**残った選び**を渡す。足す押下で最後の 1 つが外れたときに、
      // 外れた名前を「選ばれた」と伝えないため。
      options.onSelect?.(selection[selection.length - 1] ?? null, additive);
    },
    onAnnexActivate(name: string, itemId: string): void {
      options.onAnnexActivate?.(name, itemId);
    },
    onTogglePick: togglePick,
    onNudge: nudgeCells,
    onRelease: releasePlacement,
    onStartRename: startRename,
    onCommitRename: commitRename,
    onStartGroups: startGroups,
    onStartAnnotate: startAnnotate,
    onCommitAnnotate: commitAnnotate,
    onCancelAnnotate(): void {
      annotating = null;
      paint();
    },
    onCancelRename(): void {
      renaming = null;
      notice = '';
      paint();
    },
    onConnectPointerDown(event: PointerEvent, name: string): void {
      startConnect(event, elementAnchor(name));
    },
    onConnectPointerMove: onConnectMove,
    onConnectPointerUp: onConnectUp,
    onConnectToggle: (name: string) => toggleConnectSource(elementAnchor(name)),
    onInsertGap: insertGap,
    onSizePointerDown(event: PointerEvent, name: string, axes: ResizeAxes): void {
      if (draft === null || saving || event.button !== 0) return;
      // 人物のドラッグ（箱を動かす）へ渡さない。縁で始めた操作の意味は「大きさを変える」の 1 つ。
      event.stopPropagation();
      const target = event.currentTarget;
      if (target instanceof Element) target.setPointerCapture(event.pointerId);
      const node = model.byName.get(name);
      if (node === undefined) return;
      // 倍率と升目も**掴んだ瞬間のもの**を覚える（ドラッグ中にホイールを回しても箱が飛ばない）。
      sizeDrag = {
        pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: model.spacing,
        scale: view.scale, anchor: { column: node.column, row: node.row }, axes,
      };
    },
    onSizePointerMove(event: PointerEvent): void {
      const drag = sizeDrag;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      changeSpacing(resizeFromDrag({
        start: drag.start,
        pointer: { x: event.clientX - drag.x, y: event.clientY - drag.y },
        scale: drag.scale,
        anchor: drag.anchor,
        axes: drag.axes,
      }));
    },
    onSizePointerUp(event: PointerEvent): void {
      if (sizeDrag?.pointerId !== event.pointerId) return;
      sizeDrag = null;
      const target = event.currentTarget;
      if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    },
    onResizeKey(event: KeyboardEvent, axes: ResizeAxes): void {
      const step = event.shiftKey ? COARSE_RESIZE_PX : RESIZE_PX;
      const horizontal = axes.width && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');
      const vertical = axes.height && (event.key === 'ArrowUp' || event.key === 'ArrowDown');
      if (!horizontal && !vertical) return;
      event.preventDefault();
      changeSpacing(resizedSpacing(model.spacing, {
        x: horizontal ? (event.key === 'ArrowLeft' ? -step : step) : 0,
        y: vertical ? (event.key === 'ArrowUp' ? -step : step) : 0,
      }, axes));
    },
  };

  // ---- 描画 ---------------------------------------------------------------
  /**
   * 枠の中で**別のものが載っている場所**（枠の左上を原点とする px）。ここへは ＋／− を置かない。
   *
   * 実寸で測るのは、字の大きさ・locale・選んだ数で幅が変わるため（`47%` と `100%` で 1 文字違い、
   * 「1 人を選択中」と「12 人を選択中」でも違う）。決め打ちの数値を置くと、広がった日にその下の
   * ＋ が押せないまま残る。
   *
   * 出ていない区画（`display: none`）は矩形が 0 になるので、**畳んでから数える** — 0 の矩形を
   * 残すと枠の左上隅の ＋ だけが理由もなく消える。
   */
  function blockedBoxes(): readonly { left: number; top: number; right: number; bottom: number }[] {
    const frameBox = viewport.getBoundingClientRect();
    return [chrome.toolbar, minimap.root, chrome.selectionBar, chrome.connectorBar]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => ({
        left: box.left - frameBox.left,
        top: box.top - frameBox.top,
        right: box.right - frameBox.left,
        bottom: box.bottom - frameBox.top,
      }));
  }

  function syncViews(): void {
    const wanted = new Set(model.chart.nodes.map((node) => node.name));
    // 控えの写しを回してから外す。外す要素が焦点を持っていると `blur` が同期で飛び、その先で
    // 描き直しが走りうる（改名の確定がそれ）。控えを直に回していると、その描き直しが同じ控えを
    // 書き換えながら走ることになる。
    for (const [name, nodeView] of [...nodeViews]) {
      if (wanted.has(name)) continue;
      nodeViews.delete(name);
      nodeView.root.remove();
    }
    for (const node of model.chart.nodes) {
      if (nodeViews.has(node.name)) continue;
      // 札の中身（群の札・親・注記）は**いま描いている図**から引く。保存済みの図を渡すと、
      // 下書きで足した要素の札だけが「図に居ない人物」として空になる。
      const nodeView = createNodeView(doc, model.source, node.name, tr, nodeCallbacks);
      nodeViews.set(node.name, nodeView);
      surface.appendChild(nodeView.root);
    }
    const families = model.source.families;
    while (edgeViews.length > families.length) edgeViews.pop()!.root.remove();
    for (let index = edgeViews.length; index < families.length; index += 1) {
      const edgeView = createEdgeView(doc, tr, {
        onSelectFamily(pressed, additive) {
          selectedFamilies = pickLine(selectedFamilies, pressed, additive);
          if (!additive) selectedConnectors = [];
          paint();
        },
        onEditLabel(pressed) {
          // 家族は id を持たないので**親の名前**で指す（`familyAnchor` の約束）。番号で指すと、
          // 家族を 1 件消したときに後ろが繰り上がり、書き込む先が黙って別の家族へ移る。
          const family = model.source.families[pressed];
          if (family === undefined) return;
          startLineLabel(familyAnchor(family.parents));
        },
      });
      edgeViews.push(edgeView);
      edgesSvg.appendChild(edgeView.root);
    }
    const wantedLinks = new Set(model.links.map((link) => link.connector.id));
    for (const [id, linkView] of linkViews) {
      if (wantedLinks.has(id)) continue;
      linkView.root.remove();
      linkViews.delete(id);
    }
    for (const link of model.links) {
      if (linkViews.has(link.connector.id)) continue;
      const linkView = createLinkView(doc, link.connector.id, tr, {
        onSelectLink(pressed, additive) {
          selectedConnectors = pickLine(selectedConnectors, pressed, additive);
          if (!additive) selectedFamilies = [];
          paint();
        },
        onEditLabel: (pressed) => startLineLabel(lineAnchor(pressed)),
      });
      linkViews.set(link.connector.id, linkView);
      linksSvg.appendChild(linkView.root);
    }
  }

  function paint(): void {
    model = deriveModel({ document: document_, draft, automatic: automaticCache(draft ?? document_) });
    // 部品の増減は**毎回ここで揃える**。要素と線は編集中に増えるので、差し替えのときだけ揃える
    // 作りだと、足した要素の札が次に図を開き直すまで現れない。
    syncViews();
    if (!fitted && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
      fitted = true;
      view = fitChart(viewport.clientWidth, viewport.clientHeight, model.surface.width, model.surface.height);
    }
    const editing = draft !== null;
    const picked = new Set(chosen());

    viewport.setAttribute('aria-label', tr('chartLabel'));
    edgesSvg.setAttribute('aria-label', tr('selectLine'));
    surface.style.width = `${model.surface.width}px`;
    surface.style.height = `${model.surface.height}px`;
    surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    // 枠の太さを倍率から切り離すのに要る（スタイルシート側で 1.5px をこれで割る）。
    root.style.setProperty('--diagram-scale', String(view.scale));
    setClass(viewport, 'is-editing', editing);
    setClass(viewport, 'is-dragging', dragging);

    for (const target of [gridSvg, edgesSvg, linksSvg]) {
      target.setAttribute('width', String(model.surface.width));
      target.setAttribute('height', String(model.surface.height));
    }
    setClass(gridSvg, 'anytime-diagram-hidden', !editing);
    gridPath.setAttribute('d', model.freeCells);

    /*
      閲覧中に要素を選んだら、**関連箇所だけを残して他を薄くする**（ユーザー指示）。

      要素ごと消さずに薄くするのは、消すと図の骨格（どこに何が在ったか）まで失われ、選んだ
      要素が広い余白に 1 つ浮くため。編集中は当てない — 編集は図の全体を見ながら行う。
    */
    const related = !editing && picked.size > 0 ? relatedTo(model.source, chosen()) : null;
    // 選んだ家族に出る人物。複数選んだら**和**を取る（選んだどれかに出る人は薄くしない）。
    const selectedPeople = selectedFamilies.length === 0 ? null : new Set(
      selectedFamilies.flatMap((index) => {
        const connector = model.connectors[index];
        return connector === undefined ? [] : [...connector.family.parents, ...connector.family.children];
      }),
    );
    for (const [index, edgeView] of edgeViews.entries()) {
      const connector = model.connectors[index];
      if (connector === undefined) continue;
      edgeView.update({
        index,
        connector,
        scale: view.scale,
        selected: selectedFamilies.includes(index),
        dimmed: (anyLineSelected() && !selectedFamilies.includes(index))
          || (related !== null && !related.families.has(index)),
      });
    }
    for (const link of model.links) {
      linkViews.get(link.connector.id)?.update({
        link,
        label: tr('selectConnector', {
          from: anchorLabel(link.connector.from),
          to: anchorLabel(link.connector.to),
        }),
        scale: view.scale,
        selected: selectedConnectors.includes(link.connector.id),
        dimmed: (anyLineSelected() && !selectedConnectors.includes(link.connector.id))
          || (related !== null && !related.links.has(link.connector.id)),
      });
    }
    // 引いている最中の仮の線。始点は札の縁ではなく中心から出す（相手が決まるまで縁が定まらない）。
    // 線の中点から引いているときは、その中点そのものが付け根になる。
    const dragFrom = connectDrag === null ? null : anchorPoint(connectDrag.from);
    setAttr(previewPath, 'd', connectDrag === null || dragFrom === null
      ? null
      : `M ${dragFrom.x} ${dragFrom.y} L ${connectDrag.x} ${connectDrag.y}`);

    for (const node of model.chart.nodes) {
      nodeViews.get(node.name)?.update({
        node,
        spacing: model.spacing,
        editing,
        picked: picked.has(node.name),
        dimmed: (selectedPeople !== null && !selectedPeople.has(node.name))
          || (related !== null && !related.names.has(node.name)),
        moved: node.name in model.placements,
        shape: diagramShapeOf(model.source, node.name),
        isAnchor: node.name === model.resizeAnchor,
        saving,
        renaming: renaming === node.name,
        annotating: annotating === node.name,
        // 群の札と注記は**いま描いている図**（編集中は下書き）から引く。作るときに焼き込むと、
        // 書き換えても札が前の字のまま残る。
        groupBadges: groupBadgesOf(model.source, node.name),
        annotation: model.source.annotations[node.name] ?? '',
        connectSource: connectSource !== null && sameAnchor(connectSource, elementAnchor(node.name)),
        // 添えた項目も群の札・注記と同じく描くたびに当てる（作るときに焼き込まない）。
        annex: elementAnnex[node.name] ?? null,
        annexActivatable: options.onAnnexActivate !== undefined,
      });
    }

    gaps.update({
      spacing: model.spacing, extent: model.extent, surface: model.surface, editing, saving,
    });
    const groupFamily = editingGroups === null ? undefined : model.source.families[editingGroups];
    groupDialog.update({
      saving,
      selection: !editing || groupFamily === undefined ? null : {
        label: tr('groupsFor', { parents: groupFamily.parents.join('・') }),
        axes: model.source.groups,
        values: groupFamily.groups,
      },
    });
    midpoints.update({ midpoints: model.midpoints, editing, saving, connectSource });
    // 字は閲覧中も出す（図の中身なので）。書き換え口だけが編集中に開く。
    lineLabels.update({
      midpoints: model.midpoints,
      editing,
      saving,
      labelling: editing ? labelling : null,
      // 字も線と一緒に薄くする（線が消えかけているのに字だけが濃く残ると、どの線のものか読めない）。
      focusKeys: related?.lineKeys ?? null,
    });
    viewControls.update({ scale: view.scale, minScale: MIN_SCALE, maxScale: MAX_SCALE });
    /*
      ミニマップの線は**全部を 1 本の経路にまとめて**渡す（部分経路は互いに独立なので、1 つの
      `d` に並べても形が変わらない）。線 1 本ごとに要素を持たせると、図を動かしている間じゅう
      線の数ぶんの属性を書き換えることになる。
    */
    const minimapLines = [
      ...model.connectors.flatMap((connector) => [connector.marriage, connector.descent]),
      ...model.links.map((link) => link.geometry.path),
    ].filter((path): path is string => path !== null).join(' ');
    minimap.update({
      nodes: model.chart.nodes,
      spacing: model.spacing,
      lines: minimapLines,
      surface: model.surface,
      view,
      frame,
    });
    /*
      **札の中身を先に当ててから測る。** 保存の口・自動配置に戻す・選択の区画は、この更新で
      出入りし幅も変わる。測ってから当てる順にすると、ゲッターは 1 描画前の札の大きさを見て
      逃がし先を決め、広がった側の切れ目が札の下に入ったまま押せなくなる（編集へ入った直後の
      1 描画で実測）。
    */
    chrome.update({
      document: model.source,
      names: model.chart.nodes.map((node) => node.name),
      selected: chosen()[chosen().length - 1] ?? '',
      selectionCount: picked.size,
      editing,
      editable,
      alwaysEditing,
      compact,
      canSave: options.onSave !== undefined,
      changed: model.changed,
      saving,
      notice,
      spacing: model.spacing,
      draft: draft?.layout ?? null,
      shiftable: model.lines.shiftable,
      // 選んだ 1 つの形。0 個・2 個以上のときは既定を出す（選び口はそのとき押せない）。
      elementShape: picked.size === 1
        ? diagramShapeOf(model.source, lastChosen())
        : DEFAULT_DIAGRAM_SHAPE,
      lineSelection: currentLineSelection(),
    });
    /*
      枠の中へ浮かせた札（左上の操作列・右上の見え方の操作・左下の選択）と重なる ＋／− は、
      札の脇へ逃がす（`ui/gutter.ts` の `avoiding`）。重ねたままにすると上に載っているほうが
      押下を取り、押したつもりの切れ目とは違う位置へ挿入される。升目の ＋ は逃がし先が
      その升目そのものなので、従来どおり描かない。
    */
    const blocked = blockedBoxes();
    gutter.update({
      editing, saving, spacing: model.spacing, view, frame, lines: model.lines, blocked,
    });
    cellAdders.update({
      editing, saving, spacing: model.spacing, view, frame,
      extent: model.extent, occupied: model.occupied, blocked,
    });
  }

  /**
   * 設定の区画へ渡す「選んでいる線」。手で引いた線と家族の線を同じ形へ揃える。
   *
   * 家族の線には**上書きが無ければ種別の既定**を載せる。載せないと、まだ触っていない線を
   * 選んだときに区画の値が空になり、実際に描かれている線と食い違う。
   */
  /**
   * 端の呼び名。**線を指す端は「線 c1」ではなく、その線が結んでいる相手で呼ぶ。**
   *
   * 生の id を出さない。id は図の中だけで一意にするための値で、人が付けた名前ではない。
   * 相手の見つからない線は id を出すしかないので、そのときだけ id を添える。
   */
  function anchorLabel(anchor: DiagramAnchor, seen: ReadonlySet<string> = new Set()): string {
    if (anchor.kind === 'element') return anchor.name;
    if (anchor.kind === 'family') return tr('familyAnchor', { parents: anchor.parents.join('・') });
    const target = model.source.connectors.find((item) => item.id === anchor.line);
    // 輪になった端（A が B を、B が A を指す）で呼び名を組み立て続けない。そういう線は描かれない
    // ので普段ここへは来ないが、呼び名の側は**描けているか**を知らないので自分で断つ。
    if (target === undefined || seen.has(anchor.line)) return tr('lineAnchor', { line: anchor.line });
    const deeper = new Set(seen).add(anchor.line);
    return tr('lineAnchorBetween', {
      from: anchorLabel(target.from, deeper),
      to: anchorLabel(target.to, deeper),
    });
  }

  /** 線を 1 本でも選んでいるか。薄表示の判定を 1 か所に置く。 */
  function anyLineSelected(): boolean {
    return selectedConnectors.length > 0 || selectedFamilies.length > 0;
  }

  function currentLineSelection(): LineSelection | null {
    const count = selectedConnectors.length + selectedFamilies.length;
    if (count === 0) return null;
    // 区画に出す値は**最後に選んだ 1 本**のもの。平均や「まちまち」を出しても、そこから次の値を
    // 選ぶ操作にはならない（選び口は 1 つの値しか指せない）。変更は選んだぶん全部に当たる。
    const lastConnector = selectedConnectors[selectedConnectors.length - 1];
    const connector = lastConnector === undefined
      ? undefined
      : model.source.connectors.find((item) => item.id === lastConnector);
    const lastFamily = selectedFamilies[selectedFamilies.length - 1];
    const family = lastFamily === undefined ? undefined : model.connectors[lastFamily];
    const look = connector ?? family?.look;
    if (look === undefined) return null;
    const label = count > 1
      ? tr('selectedLines', { count })
      : (connector !== undefined
        ? tr('selectConnector', { from: anchorLabel(connector.from), to: anchorLabel(connector.to) })
        : `${tr('selectLine')}: ${family!.family.parents.join('・')}`);
    return {
      label,
      look,
      // 消す口は手で引いた線が 1 本でも選ばれていれば出す（家族の線は要素の取り除きが受け持つ）。
      deletable: selectedConnectors.length > 0,
    };
  }

  paint();

  return {
    update(next: DiagramViewerUpdate): void {
      if (next.locale !== undefined) t = createDiagramT(next.locale);
      if (next.editable !== undefined) editable = next.editable;
      if (next.compact !== undefined) compact = next.compact;
      // 札は作り直さない。`paint()` が `nodeView.update` で当て直すので、差し替えだけで届く。
      if (next.elementAnnex !== undefined) elementAnnex = next.elementAnnex;
      if (next.document !== undefined && next.document !== document_) {
        document_ = next.document;
        // 別の図の人物名・升目を次の操作へ持ち越さない。
        setDraft(null);
        clearTransientSelection();
        notice = '';
        // 差し替えた図も全体表示から始める。前の図に合わせた倍率を持ち越すと、大きさの違う
        // 図では画面の外や豆粒の状態で開く。
        fitted = false;
        // 常時編集の宿主では新しい図で編集し直す。**`setDraft` を通す** — 直前の
        // `setDraft(null)` で「編集していない」と伝えたままにすると、宿主が持つ下書きの
        // 有無が画面と食い違う。
        if (alwaysEditing && editable) setDraft(document_);
      }
      if (next.locale !== undefined || next.document !== undefined) {
        // 札の文言は要素を作るときに焼き込むので、locale が変わったら作り直す。
        for (const nodeView of nodeViews.values()) nodeView.root.remove();
        nodeViews.clear();
        while (edgeViews.length > 0) edgeViews.pop()!.root.remove();
        for (const linkView of linkViews.values()) linkView.root.remove();
        linkViews.clear();
      }
      paint();
    },
    getDraft: () => draft,
    save,
    destroy(): void {
      observer?.disconnect();
      viewport.removeEventListener('wheel', onWheel);
      root.remove();
      nodeViews.clear();
      edgeViews.length = 0;
      linkViews.clear();
    },
  };
}
