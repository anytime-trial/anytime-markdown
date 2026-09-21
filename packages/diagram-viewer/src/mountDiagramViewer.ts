/**
 * 系図（ダイアグラム）の閲覧と配置編集。React 非依存の vanilla DOM。
 *
 * 移植元は anytime-travel の `src/screens/Genealogy.tsx`（React）。状態と導出は `model.ts` に
 * 寄せ、この層は**イベントと DOM の更新だけ**を持つ。
 */

import {
  cellKey,
  cellLimit,
  chartPoint,
  type ChartView,
  columnPitch,
  DEFAULT_DIAGRAM_SPACING,
  type DiagramConnector,
  type DiagramDocument,
  type DiagramLayout,
  diagramPeople,
  type DiagramSpacing,
  fitChart,
  fittingShift,
  type GridAxis,
  type GridCell,
  gridLineEdits,
  type GridShift,
  insertGapEdit,
  isDefaultDiagramSpacing,
  isNoShift,
  MAX_SCALE,
  MIN_SCALE,
  nearestCell,
  nearestFreeCell,
  nextConnectorId,
  nextElementName,
  nudgeShift,
  placementFromDrag,
  removeDiagramElement,
  renameDiagramElement,
  resizedSpacing,
  resizeFromDrag,
  rowPitch,
  shiftCell,
  zoomAt,
} from '@anytime-markdown/diagram-core';

import { createDiagramT, type DiagramT } from './i18n';
import { createAutomaticCache, deriveModel, type DiagramModel } from './model';
import { DIAGRAM_ROOT_CLASS, DIAGRAM_STYLES } from './theme/diagramStyles';
import type { DiagramViewerHandle, DiagramViewerOptions, DiagramViewerUpdate } from './types';
import { createCellAdderView } from './ui/cellAdders';
import { createChromeView, createConfirmView, RESET_LAYOUT } from './ui/chrome';
import { createLinkView, type LinkView } from './ui/connectors';
import { el, setAttr, setClass, svg } from './ui/dom';
import { createEdgeView, type EdgeView } from './ui/edges';
import { createGutterView } from './ui/gutter';
import { createNodeView, type NodeView, type ResizeAxes } from './ui/nodes';
import { createViewControls } from './ui/viewControls';

const INITIAL_VIEW: ChartView = { x: 20, y: 20, scale: 0.7 };
/** キーボードで 1 回変える箱の大きさ（px）。Shift を添えると粗く変わる。 */
const RESIZE_PX = 4;
const COARSE_RESIZE_PX = 20;

/** 押下を渡さない要素。ここで始めたドラッグは図の平行移動にしない。 */
const interactive = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('button, a, input, select, details') !== null;
/**
 * ホイールの拡大縮小を塞いでよい要素。**中でスクロール・値の増減が起こるものだけ**。
 *
 * `interactive` と分けてある。あちらは押下（ドラッグを始めさせない）の判定でボタンを塞ぐのが
 * 正しい。ホイールで同じ判定を使うと、縁のアイコンが並ぶ帯の上で拡大縮小が効かなくなる。
 */
const scrollable = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, select, details, textarea') !== null;

export function mountDiagramViewer(container: HTMLElement, options: DiagramViewerOptions): DiagramViewerHandle {
  const doc = container.ownerDocument;
  let document_ = options.document;
  let editable = options.editable ?? false;
  let compact = options.compact ?? false;
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
  let selectedFamily: number | null = null;
  /** 選んでいる接続線の id。家族の線とは同時に選ばない（見た目を変えられるのは手引きの線だけ）。 */
  let selectedConnector: string | null = null;
  /** 名札を書き換えている要素。`null` は書き換えていない状態。 */
  let renaming: string | null = null;
  /**
   * 接続の始点として待ち受けている要素。
   *
   * 指でのドラッグと、キーボードでの「始点を押す → 終点を押す」の両方がこの 1 つを共有する。
   * 別々に持つと、指で引きかけたまま Tab へ移ったときに 2 つの始点が並び、どちらから線が
   * 出るのか画面から読めなくなる。
   */
  let connectSource: string | null = null;
  let connectDrag: { readonly pointerId: number; readonly from: string; x: number; y: number } | null = null;
  let draft: DiagramDocument | null = null;
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
  surface.append(gridSvg, edgesSvg, linksSvg);

  const viewControls = createViewControls(doc, tr, {
    onZoom: zoom,
    onFit: fit,
    onResetView: () => { view = INITIAL_VIEW; paint(); },
  });
  const chrome = createChromeView(doc, tr, {
    onLocate: locate,
    onStartEditing: startEditing,
    onStopEditing: stopEditing,
    onSave: () => { void save(); },
    onConfirm: (kind) => confirmView.show(kind),
    onClearSelection: () => { selection = []; paint(); },
    onResetSpacing: () => changeSpacing(DEFAULT_DIAGRAM_SPACING),
    onRenameSelected: () => { startRename(lastChosen()); },
    onRemoveSelected: () => { removeElement(lastChosen()); },
    onConnectorStyle: styleConnector,
    onDeleteConnector: deleteConnector,
  });
  const confirmView = createConfirmView(doc, tr, (kind) => {
    // 「破棄」は編集そのものをやめ、「自動配置に戻す」は**配置だけ**を戻す（要素や線は残す）。
    setDraft(kind === 'discard' ? null : { ...(draft ?? document_), layout: RESET_LAYOUT });
    clearTransientSelection();
    paint();
  });
  const gutter = createGutterView(doc, tr, { onEditGridLine: editGridLine });
  const cellAdders = createCellAdderView(doc, tr, { onAddElement: addElement });

  /**
   * 選択と線の区画を枠の左下へ重ねる入れ物。
   *
   * 枠の外の帯から移した。対象（選んだ札・選んだ線）と、それに効く操作を同じ場所へ置くため
   * — 見え方の操作を枠の中へ移したのと同じ理由。左下を選ぶのは、左上が見え方の操作で、
   * 上端と左端には行・列を増やす ＋ の帯が走っているため。
   */
  const panels = el(doc, 'div', { className: 'anytime-diagram-panels' });
  panels.append(chrome.selectionBar, chrome.connectorBar);

  // 縁のアイコンは**図より前に置く**。後ろに置くとタブ順が人物数ぶんの取っ手の後になり、
  // 最初の ＋ へ届くまで何百回も Tab を押すことになる。重ね順は z-index で決める。
  viewport.append(gutter.root, cellAdders.root, surface, viewControls.root, panels, confirmView.root);
  root.append(
    style, chrome.title, chrome.lead, chrome.toolbar,
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

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || interactive(event.target)) return;
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragging = true;
    setClass(viewport, 'is-dragging', true);
  });
  viewport.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;
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
  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0;
    setClass(viewport, 'is-dragging', dragging);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('lostpointercapture', (event) => {
    pointers.delete(event.pointerId);
    dragging = pointers.size > 0;
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
  function clearTransientSelection(): void {
    selection = [];
    selectedFamily = null;
    selectedConnector = null;
    renaming = null;
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

  /** 下書きを 1 段進める。編集に入っていない状態からは触らない（掴めるのは編集中だけ）。 */
  function updateDraft(next: (current: DiagramDocument) => DiagramDocument): void {
    if (draft === null) return;
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
    const name = nextElementName(peopleNow());
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
    notice = '';
    paint();
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
    if (connectSource === name) connectSource = null;
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
  function connect(from: string, to: string): void {
    if (draft === null || saving || from === to) return;
    const people = peopleNow();
    if (!people.has(from) || !people.has(to)) return;
    if (draft.connectors.some((item) => item.from === from && item.to === to)) return;
    const connector: DiagramConnector = {
      id: nextConnectorId(draft.connectors),
      from,
      to,
      line: 'solid',
      color: 'default',
      start: 'none',
      end: 'arrow',
    };
    selectedConnector = connector.id;
    selectedFamily = null;
    updateDraft((current) => ({ ...current, connectors: [...current.connectors, connector] }));
  }

  /** 選んでいる線の見た目を変える。渡した項目だけを差し替える。 */
  function styleConnector(patch: Partial<Pick<DiagramConnector, 'line' | 'start' | 'end'>>): void {
    const id = selectedConnector;
    if (id === null) return;
    updateDraft((current) => ({
      ...current,
      connectors: current.connectors.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function deleteConnector(): void {
    const id = selectedConnector;
    if (id === null) return;
    selectedConnector = null;
    updateDraft((current) => ({
      ...current,
      connectors: current.connectors.filter((item) => item.id !== id),
    }));
  }

  /** 指が差している札の人物名。接続の相手を決めるのに読む。 */
  function personUnder(clientX: number, clientY: number): string | null {
    const element = doc.elementFromPoint(clientX, clientY);
    const node = element instanceof Element ? element.closest('[data-person]') : null;
    return node?.getAttribute('data-person') ?? null;
  }

  /** 接続の始点を押した／待ち受け中の始点と結んだ。キーボードと指の両方がここへ来る。 */
  function toggleConnectSource(name: string): void {
    if (draft === null || saving) return;
    if (connectSource !== null && connectSource !== name) {
      const from = connectSource;
      connectSource = null;
      connect(from, name);
      return;
    }
    connectSource = connectSource === name ? null : name;
    paint();
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
    if (options.onSave === undefined || draft === null) return;
    saving = true;
    notice = '';
    paint();
    try {
      await options.onSave(draft);
      setDraft(null);
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
    onTogglePick: togglePick,
    onNudge: nudgeCells,
    onRelease: releasePlacement,
    onStartRename: startRename,
    onCommitRename: commitRename,
    onCancelRename(): void {
      renaming = null;
      notice = '';
      paint();
    },
    onConnectPointerDown(event: PointerEvent, name: string): void {
      if (draft === null || saving || event.button !== 0) return;
      // 待ち受け中の始点があるなら、この押下は「結ぶ」の意味になる。新しい始点で上書きしない。
      if (connectSource !== null && connectSource !== name) {
        const from = connectSource;
        connectSource = null;
        connect(from, name);
        return;
      }
      const target = event.currentTarget;
      if (target instanceof Element) target.setPointerCapture(event.pointerId);
      const rect = viewport.getBoundingClientRect();
      const point = chartPoint(view, rect, event.clientX, event.clientY);
      connectSource = name;
      connectDrag = { pointerId: event.pointerId, from: name, x: point.x, y: point.y };
      paint();
    },
    onConnectPointerMove(event: PointerEvent): void {
      if (connectDrag === null || connectDrag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const rect = viewport.getBoundingClientRect();
      const point = chartPoint(view, rect, event.clientX, event.clientY);
      connectDrag = { ...connectDrag, x: point.x, y: point.y };
      paint();
    },
    onConnectPointerUp(event: PointerEvent): void {
      const drag = connectDrag;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const target = event.currentTarget;
      if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      connectDrag = null;
      const to = personUnder(event.clientX, event.clientY);
      // 相手の上で離していなければ**待ち受けたまま**にする（押しただけの操作＝始点の指定）。
      if (to === null || to === drag.from) { paint(); return; }
      connectSource = null;
      connect(drag.from, to);
    },
    onConnectToggle: toggleConnectSource,
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
    return [viewControls.root, chrome.selectionBar, chrome.connectorBar]
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
      const edgeView = createEdgeView(doc, families[index]!, index, tr, {
        onSelectFamily(pressed) {
          selectedFamily = selectedFamily === pressed ? null : pressed;
          selectedConnector = null;
          paint();
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
        onSelectLink(pressed) {
          selectedConnector = selectedConnector === pressed ? null : pressed;
          selectedFamily = null;
          paint();
        },
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

    const selectedFamilyConnector = selectedFamily === null ? undefined : model.connectors[selectedFamily];
    const selectedPeople = selectedFamilyConnector === undefined ? null : new Set([
      ...selectedFamilyConnector.family.parents, ...selectedFamilyConnector.family.children,
    ]);
    for (const [index, edgeView] of edgeViews.entries()) {
      const connector = model.connectors[index];
      if (connector === undefined) continue;
      edgeView.update({
        connector,
        selected: selectedFamily === index,
        dimmed: selectedFamily !== null && selectedFamily !== index,
      });
    }
    for (const link of model.links) {
      linkViews.get(link.connector.id)?.update({
        link,
        scale: view.scale,
        selected: selectedConnector === link.connector.id,
        dimmed: selectedConnector !== null && selectedConnector !== link.connector.id,
      });
    }
    // 引いている最中の仮の線。始点は札の縁ではなく中心から出す（相手が決まるまで縁が定まらない）。
    const dragFrom = connectDrag === null ? undefined : model.byName.get(connectDrag.from);
    setAttr(previewPath, 'd', connectDrag === null || dragFrom === undefined
      ? null
      : `M ${dragFrom.x + model.spacing.nodeWidth / 2} ${dragFrom.y + model.spacing.nodeHeight / 2} `
        + `L ${connectDrag.x} ${connectDrag.y}`);

    for (const node of model.chart.nodes) {
      nodeViews.get(node.name)?.update({
        node,
        spacing: model.spacing,
        editing,
        picked: picked.has(node.name),
        dimmed: selectedPeople !== null && !selectedPeople.has(node.name),
        moved: node.name in model.placements,
        isAnchor: node.name === model.resizeAnchor,
        saving,
        renaming: renaming === node.name,
        connectSource: connectSource === node.name,
      });
    }

    viewControls.update({ scale: view.scale, minScale: MIN_SCALE, maxScale: MAX_SCALE });
    // 見え方の操作の区画（枠の左上）と重なる ＋／− は描かない。重ねると上に載っているほうが
    // 押下を取り、押したつもりの切れ目とは違う位置へ挿入される。
    const blocked = blockedBoxes();
    gutter.update({
      editing, saving, spacing: model.spacing, view, frame, lines: model.lines, blocked,
    });
    cellAdders.update({
      editing, saving, spacing: model.spacing, view, frame,
      extent: model.extent, occupied: model.occupied, blocked,
    });
    chrome.update({
      document: model.source,
      names: model.chart.nodes.map((node) => node.name),
      selected: chosen()[chosen().length - 1] ?? '',
      selectionCount: picked.size,
      editing,
      editable,
      compact,
      canSave: options.onSave !== undefined,
      changed: model.changed,
      saving,
      notice,
      spacing: model.spacing,
      draft: draft?.layout ?? null,
      shiftable: model.lines.shiftable,
      connector: model.source.connectors.find((item) => item.id === selectedConnector) ?? null,
    });
  }

  paint();

  return {
    update(next: DiagramViewerUpdate): void {
      if (next.locale !== undefined) t = createDiagramT(next.locale);
      if (next.editable !== undefined) editable = next.editable;
      if (next.compact !== undefined) compact = next.compact;
      if (next.document !== undefined && next.document !== document_) {
        document_ = next.document;
        // 別の図の人物名・升目を次の操作へ持ち越さない。
        setDraft(null);
        clearTransientSelection();
        notice = '';
        // 差し替えた図も全体表示から始める。前の図に合わせた倍率を持ち越すと、大きさの違う
        // 図では画面の外や豆粒の状態で開く。
        fitted = false;
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
