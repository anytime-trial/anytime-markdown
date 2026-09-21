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
  type DiagramLayout,
  type DiagramSpacing,
  EMPTY_DIAGRAM_LAYOUT,
  fitChart,
  fittingShift,
  type GridAxis,
  type GridCell,
  gridLineEdits,
  type GridShift,
  isDefaultDiagramSpacing,
  isNoShift,
  nearestCell,
  nearestFreeCell,
  nudgeShift,
  placementFromDrag,
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
import { createChromeView, createConfirmView, RESET_LAYOUT } from './ui/chrome';
import { el, setClass, svg } from './ui/dom';
import { createEdgeView, type EdgeView } from './ui/edges';
import { createGutterView } from './ui/gutter';
import { createNodeView, type NodeView, type ResizeAxes } from './ui/nodes';

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
  let draft: DiagramLayout | null = null;
  let saving = false;
  let saveError = '';
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
  surface.append(gridSvg, edgesSvg);

  const chrome = createChromeView(doc, tr, {
    onZoom: zoom,
    onFit: fit,
    onResetView: () => { view = INITIAL_VIEW; paint(); },
    onLocate: locate,
    onStartEditing: startEditing,
    onStopEditing: stopEditing,
    onSave: () => { void save(); },
    onConfirm: (kind) => confirmView.show(kind),
    onClearSelection: () => { selection = []; paint(); },
    onResetSpacing: () => changeSpacing(DEFAULT_DIAGRAM_SPACING),
  });
  const confirmView = createConfirmView(doc, tr, (kind) => {
    setDraft(kind === 'discard' ? null : RESET_LAYOUT);
    selection = [];
    paint();
  });
  const gutter = createGutterView(doc, tr, { onEditGridLine: editGridLine });

  // 縁のアイコンは**図より前に置く**。後ろに置くとタブ順が人物数ぶんの取っ手の後になり、
  // 最初の ＋ へ届くまで何百回も Tab を押すことになる。重ね順は z-index で決める。
  viewport.append(gutter.root, surface, confirmView.root);
  root.append(
    style, chrome.title, chrome.lead, chrome.toolbar, chrome.selectionBar,
    chrome.help, chrome.editHelp, chrome.blocked, chrome.error, viewport, chrome.note,
  );
  container.appendChild(root);

  const nodeViews = new Map<string, NodeView>();
  const edgeViews: EdgeView[] = [];

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

  function setDraft(next: DiagramLayout | null): void {
    draft = next;
    options.onDraftChange?.(next);
  }

  function startEditing(): void {
    setDraft(document_.layout ?? EMPTY_DIAGRAM_LAYOUT);
    saveError = '';
    // 選択は編集ごとに空から始める。前の編集の選択が残っていると、最初の矢印キーが覚えのない
    // 人物まで動かす。
    selection = [];
    paint();
  }

  /** 編集を終う。未保存の変更があれば確かめる。 */
  function stopEditing(): void {
    if (model.changed) { confirmView.show('discard'); return; }
    setDraft(null);
    selection = [];
    paint();
  }

  /** 下書きを 1 段進める。編集に入っていない状態からは触らない（掴めるのは編集中だけ）。 */
  function updateDraft(next: (current: DiagramLayout) => DiagramLayout): void {
    if (draft === null) return;
    setDraft(next(draft));
    paint();
  }

  /**
   * 刻みを差し替える。既定と同じ値なら**持たない**。
   *
   * 持つと、既定と同じ図なのに「未保存の変更あり」になり、保存すると既定の値が焼き付く。
   */
  function changeSpacing(next: DiagramSpacing): void {
    updateDraft((current) => {
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
    updateDraft((current) => {
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
    if (draft === null || !(name in draft.placements)) return;
    const placements = { ...draft.placements };
    delete placements[name];
    setDraft({ ...draft, placements });
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
    const edits = gridLineEdits(model.chart.nodes, draft.placements, axis, index, limit, model.chart.automatic);
    const next = kind === 'insert' ? edits.insert : edits.remove;
    if (next === null) return;
    setDraft({ ...draft, placements: next });
    paint();
  }

  async function save(): Promise<void> {
    if (options.onSave === undefined || draft === null) return;
    saving = true;
    saveError = '';
    paint();
    try {
      await options.onSave(draft);
      setDraft(null);
      selection = [];
    } catch (error) {
      saveError = error instanceof Error ? error.message : String(error);
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
  function syncViews(): void {
    const wanted = new Set(model.chart.nodes.map((node) => node.name));
    for (const [name, nodeView] of nodeViews) {
      if (wanted.has(name)) continue;
      nodeView.root.remove();
      nodeViews.delete(name);
    }
    for (const node of model.chart.nodes) {
      if (nodeViews.has(node.name)) continue;
      const nodeView = createNodeView(doc, document_, node.name, tr, nodeCallbacks);
      nodeViews.set(node.name, nodeView);
      surface.appendChild(nodeView.root);
    }
    while (edgeViews.length > document_.families.length) edgeViews.pop()!.root.remove();
    for (let index = edgeViews.length; index < document_.families.length; index += 1) {
      const edgeView = createEdgeView(doc, document_.families[index]!, index, tr, {
        onSelectFamily(pressed) {
          selectedFamily = selectedFamily === pressed ? null : pressed;
          paint();
        },
      });
      edgeViews.push(edgeView);
      edgesSvg.appendChild(edgeView.root);
    }
  }

  function paint(): void {
    model = deriveModel({ document: document_, draft, automatic: automaticCache(document_) });
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

    for (const target of [gridSvg, edgesSvg]) {
      target.setAttribute('width', String(model.surface.width));
      target.setAttribute('height', String(model.surface.height));
    }
    setClass(gridSvg, 'anytime-diagram-hidden', !editing);
    gridPath.setAttribute('d', model.freeCells);

    const selectedConnector = selectedFamily === null ? undefined : model.connectors[selectedFamily];
    const selectedPeople = selectedConnector === undefined ? null : new Set([
      ...selectedConnector.family.parents, ...selectedConnector.family.children,
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
      });
    }

    gutter.update({ editing, saving, spacing: model.spacing, view, frame, lines: model.lines });
    chrome.update({
      document: document_,
      names: model.chart.nodes.map((node) => node.name),
      selected: chosen()[chosen().length - 1] ?? '',
      selectionCount: picked.size,
      scale: view.scale,
      editing,
      editable,
      compact,
      canSave: options.onSave !== undefined,
      changed: model.changed,
      saving,
      saveError,
      spacing: model.spacing,
      draft,
      shiftable: model.lines.shiftable,
    });
  }

  syncViews();
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
        selection = [];
        selectedFamily = null;
        saveError = '';
        // 差し替えた図も全体表示から始める。前の図に合わせた倍率を持ち越すと、大きさの違う
        // 図では画面の外や豆粒の状態で開く。
        fitted = false;
      }
      if (next.locale !== undefined || next.document !== undefined) {
        // 札の文言は要素を作るときに焼き込むので、locale が変わったら作り直す。
        for (const nodeView of nodeViews.values()) nodeView.root.remove();
        nodeViews.clear();
        while (edgeViews.length > 0) edgeViews.pop()!.root.remove();
      }
      model = deriveModel({ document: document_, draft, automatic: automaticCache(document_) });
      syncViews();
      paint();
    },
    getDraft: () => draft,
    destroy(): void {
      observer?.disconnect();
      viewport.removeEventListener('wheel', onWheel);
      root.remove();
      nodeViews.clear();
      edgeViews.length = 0;
    },
  };
}
