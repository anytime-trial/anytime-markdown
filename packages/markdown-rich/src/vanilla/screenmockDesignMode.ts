import {
  SCREENMOCK_VARS,
  collectScreenmockThemeVars,
  parseScreenmock,
  sanitizeScreenmockHtml,
  scheduleConnectedRerender,
} from "./screenmockPreview";
import {
  annotateScreenmockHtmlPaths,
  applyElementOffset,
  applyElementSizeToScreenHtml,
  findElementByPath,
  moveScreenmockElement,
  replaceScreenmockScreenHtml,
} from "./screenmockHtmlMutations";
import { resolveDropTarget, type DropCandidate, type DropDirection } from "./screenmockDropTarget";

export type { ScreenmockElementSize } from "./screenmockHtmlMutations";

export interface CreateScreenmockDesignModePreviewOptions {
  source: string;
  getSource: () => string;
  setSource: (source: string) => void;
  emptyHint?: string;
  tabListLabel?: string;
  initialSelectedPath?: string;
  onSelectionChange?: (path: string | null) => void;
  /** 自由配置ドラッグ中に表示するバッジの文言。 */
  freePositionLabel?: string;
  /** ステージ上部に出す操作ヒントの文言。 */
  hintLabel?: string;
}

export interface ScreenmockDesignModePreviewElement extends HTMLElement {
  destroy: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildRootStyle(themeVars: Record<string, string>): string {
  return Object.entries(themeVars)
    .filter(([key, value]) => key.startsWith("--am-color-") && value.trim())
    .map(([key, value]) => `${key}:${value.replaceAll(/[;{}]/g, "")};`)
    .join("");
}

function setActiveTab(tabs: HTMLButtonElement[], activeId: string): void {
  for (const tab of tabs) {
    const selected = tab.dataset.screenId === activeId;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

function findRenderedElementByPath(shadow: ShadowRoot, path: string): HTMLElement | null {
  return (
    Array.from(shadow.querySelectorAll<HTMLElement>("[data-sm-path]")).find(
      (el) => el.dataset.smPath === path,
    ) ?? null
  );
}

function screenHasPath(screenHtml: string, path: string): boolean {
  const template = document.createElement("template");
  template.innerHTML = sanitizeScreenmockHtml(annotateScreenmockHtmlPaths(screenHtml));
  return Boolean(findElementByPath(template.content, path));
}

const SCREENMOCK_DESIGN_BASE_STYLE = `
:host{${SCREENMOCK_VARS}display:block;height:100%;min-height:360px;color:var(--sm-text,#1f2328);}
*{box-sizing:border-box;}
.sm-header,.sm-footer{padding:12px 16px;border-color:var(--am-color-divider,#d0d7de);background:color-mix(in srgb,var(--sm-bg,#f6f8fa) 72%,var(--sm-paper,#fff));}
.sm-header{border-bottom:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));font-weight:600;}
.sm-footer{border-top:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));color:var(--sm-muted,#656d76);font-size:0.875rem;}
.sm-sidebar{width:220px;padding:var(--sm-gap,12px);border-right:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));background:var(--sm-bg,#f6f8fa);}
.sm-sidebar-right{border-right:0;border-left:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));order:2;}
.sm-main{flex:1;padding:16px;min-width:0;}
.sm-row{display:flex;gap:var(--sm-gap,12px);align-items:stretch;}
.sm-col{display:flex;flex-direction:column;gap:var(--sm-gap,12px);}
.sm-card{border:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));border-radius:var(--sm-radius,8px);background:var(--sm-paper,#fff);padding:var(--sm-gap,12px);}
.sm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 12px;border:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));border-radius:6px;color:var(--sm-text,#1f2328);background:var(--sm-paper,#fff);text-decoration:none;font-weight:600;}
.sm-btn-primary{border-color:var(--sm-primary,#0969da);background:var(--sm-primary,#0969da);color:var(--sm-on-primary,#fff);}
.sm-input{display:block;width:100%;min-height:34px;padding:6px 10px;border:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));border-radius:6px;color:var(--sm-text,#1f2328);background:var(--sm-paper,#fff);}
.sm-table{width:100%;border-collapse:collapse;background:var(--sm-paper,#fff);}
.sm-table th,.sm-table td{border:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));padding:8px 10px;text-align:left;}
.sm-list{margin:0;padding-left:20px;}
.sm-badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--sm-primary,#0969da);font-size:0.75rem;font-weight:600;}
.sm-heading{font-weight:700;font-size:1.125rem;margin:0 0 8px;}
.sm-text{display:block;height:10px;max-width:100%;border-radius:999px;background:var(--am-color-action-hover,rgba(0,0,0,.08));box-shadow:0 18px 0 var(--am-color-action-hover,rgba(0,0,0,.08)),0 36px 0 var(--am-color-action-hover,rgba(0,0,0,.08));}
.sm-text[data-lines="1"]{box-shadow:none;}
.sm-text[data-lines="2"]{box-shadow:0 18px 0 var(--am-color-action-hover,rgba(0,0,0,.08));}
.sm-img{display:block;min-height:120px;border:var(--sm-border,1px solid var(--am-color-divider,#d0d7de));border-radius:var(--sm-radius,8px);background:linear-gradient(135deg,transparent calc(50% - 1px),var(--am-color-divider,#d0d7de) 50%,transparent calc(50% + 1px)),linear-gradient(45deg,transparent calc(50% - 1px),var(--am-color-divider,#d0d7de) 50%,transparent calc(50% + 1px)),var(--sm-bg,#f6f8fa);}
.sm-empty{min-height:320px;display:flex;align-items:center;justify-content:center;padding:24px;border:1px dashed var(--am-color-divider,#d0d7de);border-radius:var(--sm-radius,8px);color:var(--sm-muted,#656d76);background:var(--sm-paper,#fff);white-space:pre-wrap;text-align:center;}
.am-smdm-root{display:flex;flex-direction:column;gap:6px;min-height:360px;height:100%;}
.am-smdm-tabs{display:flex;gap:4px;overflow:auto;padding:2px 0;}
.am-smdm-tabs button{flex:0 0 auto;min-height:28px;padding:3px 10px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;cursor:pointer;font:inherit;background:transparent;color:var(--am-color-text-secondary,#656d76);}
.am-smdm-hint{flex:0 0 auto;padding:2px 0 6px;color:var(--am-color-text-secondary,#656d76);font-size:0.75rem;}
.am-smdm-tabs button[aria-selected="true"]{background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);}
.am-smdm-stage{position:relative;flex:1 1 auto;min-height:320px;overflow:auto;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--sm-bg,#f6f8fa);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--sm-text,#1f2328);padding:var(--sm-gap,12px);}
.am-smdm-stage .am-sm-wrap{display:block;position:relative;min-height:100%;background:var(--sm-paper,#fff);border:0;border-radius:0;overflow:hidden;}
.am-smdm-stage .sm-screen{border:0;border-radius:0;}
`;

const SCREENMOCK_DESIGN_PROTECTION_STYLE = `
.am-smdm-tabs{display:flex !important;position:relative !important;visibility:visible !important;pointer-events:auto !important;z-index:20 !important;}
.am-smdm-selection{display:block !important;position:absolute !important;visibility:visible !important;border:2px solid var(--sm-primary,#0969da) !important;background:transparent !important;pointer-events:none !important;z-index:10 !important;}
.am-smdm-handle{display:block !important;position:absolute !important;visibility:visible !important;width:10px !important;height:10px !important;padding:0 !important;border:1px solid var(--sm-primary,#0969da) !important;background:var(--sm-on-primary,#fff) !important;pointer-events:auto !important;z-index:11 !important;}
.am-smdm-stage{display:block !important;position:relative !important;visibility:visible !important;pointer-events:auto !important;z-index:0 !important;border:1px solid var(--am-color-divider,#d0d7de) !important;background:var(--sm-bg,#f6f8fa) !important;}
.am-smdm-handle-e{right:-6px;top:50%;transform:translateY(-50%);cursor:ew-resize;}
.am-smdm-handle-s{left:50%;bottom:-6px;transform:translateX(-50%);cursor:ns-resize;}
.am-smdm-handle-se{right:-6px;bottom:-6px;cursor:nwse-resize;}
.am-smdm-insertline{display:block !important;position:absolute !important;background:var(--sm-primary,#0969da) !important;border-radius:2px !important;pointer-events:none !important;z-index:12 !important;}
.am-smdm-dragbadge{display:block !important;position:absolute !important;padding:2px 8px !important;border-radius:999px !important;background:var(--sm-primary,#0969da) !important;color:var(--sm-on-primary,#fff) !important;font-size:0.75rem !important;pointer-events:none !important;z-index:12 !important;}
`;

/** クリック（選択）とドラッグ（移動）を分ける移動量のしきい値。 */
const DRAG_THRESHOLD_PX = 4;

/** ドラッグ中の要素の不透明度（掴んでいることを示す）。 */
const DRAG_GHOST_OPACITY = "0.75";

/**
 * プレビューの拡大率（画面 px / レイアウト px）。
 *
 * 右ペインはズーム可能なため、ポインタの移動量（画面 px）をそのままモックの座標
 * （レイアウト px）に使うとズーム時にカーソルとずれる。実寸と描画幅の比から換算する。
 * どちらかが 0（未レイアウト・jsdom）なら 1 として扱う。
 */
/**
 * `width: X%` の基準になる親のコンテンツ幅（レイアウト px）。
 *
 * パーセント指定は親のコンテンツボックスに対して解決されるため、境界ボックス幅を基準に
 * すると padding / border の分だけ小さく着地する（確定時に一段縮んで見える）。測れない
 * 環境（未レイアウト・jsdom）では呼び出し元が渡す実寸ベースの値へ退避する。
 */
export function percentBasisWidth(parent: Element, fallbackWidth: number): number {
  const style = globalThis.getComputedStyle(parent);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const content = parent.clientWidth - padding;
  return content > 0 ? content : Math.max(fallbackWidth, 1);
}

export function previewScale(renderedWidth: number, layoutWidth: number): number {
  if (!Number.isFinite(renderedWidth) || !Number.isFinite(layoutWidth)) return 1;
  if (renderedWidth <= 0 || layoutWidth <= 0) return 1;
  return renderedWidth / layoutWidth;
}

type DragState =
  | {
      kind: "resize";
      pointerId: number;
      handle: "e" | "s" | "se";
      path: string;
      screenIndex: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
      parentWidth: number;
      width: number;
      height: number;
    }
  | {
      kind: "element";
      pointerId: number;
      path: string;
      screenIndex: number;
      startX: number;
      startY: number;
      moved: boolean;
      altKey: boolean;
    };

export function createScreenmockDesignModePreview(
  options: CreateScreenmockDesignModePreviewOptions,
): ScreenmockDesignModePreviewElement {
  // host は下で destroy を後付けして拡張型にする。HTMLDivElement とは直接重ならないため unknown を経由する。
  const host = document.createElement("div") as unknown as ScreenmockDesignModePreviewElement;
  host.className = "am-screenmock-design-preview";
  host.style.cssText = "display:block;width:100%;max-width:100%;height:100%;min-height:360px;";
  const shadow = host.attachShadow({ mode: "open" });

  let activeIndex = 0;
  let selectedPath: string | null = options.initialSelectedPath ?? null;
  let selectedEl: HTMLElement | null = null;
  let selectionEl: HTMLElement | null = null;
  let drag: DragState | null = null;
  let feedbackEl: HTMLElement | null = null;

  const renderSelection = (): void => {
    selectionEl?.remove();
    selectionEl = null;
    if (!selectedEl) return;
    const screen = shadow.querySelector(".am-sm-wrap") as HTMLElement | null;
    if (!screen) return;
    const screenRect = screen.getBoundingClientRect();
    const rect = selectedEl.getBoundingClientRect();
    // オーバーレイは拡大済みコンテナの内側に置くため、画面 px のままではズーム倍率だけ
    // 二重に効いて選択枠とハンドルが要素からずれる。レイアウト px へ換算して配置する。
    const scale = currentScale();
    const overlay = document.createElement("div");
    overlay.className = "am-smdm-selection";
    overlay.style.left = `${(rect.left - screenRect.left) / scale}px`;
    overlay.style.top = `${(rect.top - screenRect.top) / scale}px`;
    overlay.style.width = `${rect.width / scale}px`;
    overlay.style.height = `${rect.height / scale}px`;
    for (const handle of ["e", "s", "se"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `am-smdm-handle am-smdm-handle-${handle}`;
      button.dataset.handle = handle;
      button.setAttribute("aria-label", handle.toUpperCase());
      button.addEventListener("pointerdown", (event) => {
        if (!selectedEl || !selectedPath) return;
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture?.(event.pointerId);
        const selectedRect = selectedEl.getBoundingClientRect();
        const parentRect = (selectedEl.parentElement ?? screen).getBoundingClientRect();
        // 実寸（画面 px）はズーム倍率を含む。style へ書くのはモックの座標（レイアウト px）
        // なので、開始寸法もポインタ移動量も倍率で割ってから扱う。
        const scale = currentScale();
        drag = {
          kind: "resize",
          parentWidth: percentBasisWidth(selectedEl.parentElement ?? screen, parentRect.width / scale),
          pointerId: event.pointerId,
          handle,
          path: selectedPath,
          screenIndex: activeIndex,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: selectedRect.width / scale,
          startHeight: selectedRect.height / scale,
          width: selectedRect.width / scale,
          height: selectedRect.height / scale,
        };
      });
      overlay.appendChild(button);
    }
    screen.appendChild(overlay);
    selectionEl = overlay;
  };

  const selectElement = (el: HTMLElement): void => {
    if (el.classList.contains("sm-screen") || el.classList.contains("am-sm-wrap")) return;
    selectedPath = el.dataset.smPath ?? null;
    selectedEl = selectedPath ? el : null;
    options.onSelectionChange?.(selectedPath);
    renderSelection();
  };

  const clearSelection = (): void => {
    if (!selectedPath && !selectedEl) return;
    selectedPath = null;
    selectedEl = null;
    options.onSelectionChange?.(null);
    renderSelection();
  };

  const render = (): void => {
    const screens = parseScreenmock(options.getSource());
    if (selectedPath) {
      const selectedScreenIndex = screenHasPath(screens[activeIndex]?.html ?? "", selectedPath)
        ? activeIndex
        : screens.findIndex((screen) => screenHasPath(screen.html, selectedPath ?? ""));
      if (selectedScreenIndex >= 0) activeIndex = selectedScreenIndex;
    }
    if (activeIndex >= screens.length) activeIndex = Math.max(0, screens.length - 1);
    const activeScreen = screens[activeIndex];
    const themeVars = collectScreenmockThemeVars(host);
    const rootStyle = buildRootStyle(themeVars);
    const tabs = screens
      .map((screen, index) =>
        `<button type="button" role="tab" data-index="${index}" data-screen-id="${escapeHtml(screen.id)}">${escapeHtml(screen.title)}</button>`,
      )
      .join("");
    const body = activeScreen
      ? `<section class="am-sm-wrap" id="${escapeHtml(activeScreen.id)}">${sanitizeScreenmockHtml(
          annotateScreenmockHtmlPaths(activeScreen.html),
        )}</section>`
      : `<div class="sm-empty">${escapeHtml(options.emptyHint ?? "Add screenmock HTML here.")}</div>`;

    // SHORTCUT: 編集UI保護は後置 !important スタイルで実装. ceiling: ユーザー CSS の !important には負ける. upgrade: 実モックで編集 UI 破壊が起きたら本文を入れ子 shadow root へ隔離.
    shadow.innerHTML = `<style>${SCREENMOCK_DESIGN_BASE_STYLE}</style>
${rootStyle ? `<style>:host{${rootStyle}}</style>` : ""}
<div class="am-smdm-root">
  ${screens.length > 1 ? `<div class="am-smdm-tabs" role="tablist" aria-label="${escapeHtml(options.tabListLabel ?? "Screens")}">${tabs}</div>` : ""}
  ${options.hintLabel ? `<div class="am-smdm-hint">${escapeHtml(options.hintLabel)}</div>` : ""}
  <div class="am-smdm-stage">${body}</div>
</div>
<style>${SCREENMOCK_DESIGN_PROTECTION_STYLE}</style>`;

    selectedEl = selectedPath ? findRenderedElementByPath(shadow, selectedPath) : null;
    if (!selectedEl) selectedPath = null;

    const tabButtons = Array.from(shadow.querySelectorAll<HTMLButtonElement>(".am-smdm-tabs button"));
    if (activeScreen) setActiveTab(tabButtons, activeScreen.id);
    for (const tab of tabButtons) {
      tab.addEventListener("click", () => {
        activeIndex = Number(tab.dataset.index ?? 0);
        clearSelection();
        render();
      });
    }
    shadow.querySelector(".am-sm-wrap")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>("[data-sm-path]");
      if (el) {
        selectElement(el);
      } else {
        clearSelection();
      }
    });
    shadow.querySelector(".am-sm-wrap")?.addEventListener("dragstart", (event) => {
      // pointerdown の preventDefault を取りこぼした経路（画像のドラッグ等）の保険。
      event.preventDefault();
    });
    shadow.querySelector(".am-sm-wrap")?.addEventListener("pointerdown", (event) => {
      const pointerEvent = event as PointerEvent;
      const el = (pointerEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-sm-path]");
      // 画面ルート（sm-screen）は移動対象外。ドロップ先コンテナとしてのみ使う。
      if (!el?.dataset.smPath || el.classList.contains("sm-screen")) return;
      // リンク・画像はブラウザ既定のネイティブドラッグが走り、以降 pointerup が届かず
      // ドロップを取りこぼす（jsdom では再現しない）。既定動作を止めてから掴む。
      pointerEvent.preventDefault();
      // プレビューペインの ZoomPan は祖先で pointerdown を拾ってパンを始める。伝播を止めないと
      // 要素の移動とプレビュー全体のパンが同時に走り、「部品でなく画面全体が動く」ように見える
      // （リサイズハンドルが同じ理由で stopPropagation している）。要素を掴まない場合は
      // 伝播させ、背景ドラッグでのパンは従来どおり効かせる。
      pointerEvent.stopPropagation();
      drag = {
        kind: "element",
        pointerId: pointerEvent.pointerId,
        path: el.dataset.smPath,
        screenIndex: activeIndex,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        moved: false,
        altKey: pointerEvent.altKey,
      };
    });
    renderSelection();
  };

  /** shadow.elementsFromPoint を持たない環境（jsdom 既定）では空配列にフォールバックする。 */
  const elementsFromPoint = (x: number, y: number): Element[] =>
    typeof shadow.elementsFromPoint === "function" ? shadow.elementsFromPoint(x, y) : [];

  /**
   * 描画中の DOM からドロップ先コンテナ・並び方向・挿入位置を求める。
   *
   * ポインタ直下の要素が子要素を持つならその要素を（内側へ追加）、持たないならその親を
   * （兄弟として挿入）コンテナとする。移動元自身とその子孫はコンテナにしない。
   */
  const resolveDropContext = (
    event: PointerEvent,
    fromPath: string,
  ): { parentPath: string; index: number; direction: DropDirection } | null => {
    const stage = shadow.querySelector(".am-sm-wrap") as HTMLElement | null;
    if (!stage) return null;
    const hovered = elementsFromPoint(event.clientX, event.clientY).find(
      (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.smPath !== undefined,
    );
    let container: HTMLElement = stage;
    if (hovered) {
      const hasElementChildren = Array.from(hovered.children).some(
        (child) => child instanceof HTMLElement && child.dataset.smPath !== undefined,
      );
      container = hasElementChildren ? hovered : (hovered.parentElement ?? stage);
    }
    const parentPath = container === stage ? "" : (container.dataset.smPath ?? "");
    if (parentPath === fromPath || parentPath.startsWith(`${fromPath}/`)) return null;
    const computed = globalThis.getComputedStyle(container);
    const direction: DropDirection =
      computed.display.includes("flex") && computed.flexDirection.startsWith("row") ? "horizontal" : "vertical";
    const candidates: DropCandidate[] = Array.from(container.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.dataset.smPath !== undefined)
      .map((child) => ({ path: child.dataset.smPath ?? "", rect: child.getBoundingClientRect() }));
    const { index } = resolveDropTarget(candidates, { x: event.clientX, y: event.clientY }, direction);
    return { parentPath, index, direction };
  };

  /**
   * 自由配置のオフセット。既存のオフセットへドラッグ量を積む。
   *
   * relative オフセットは「本来の位置からのずれ」なので、要素の現在位置ではなく
   * 既存の left / top へ差分を足す（現在位置を使うと本来位置との差だけ二重に乗る）。
   */
  /** 現在のプレビュー拡大率。ステージ（画面ラッパ）の実寸とレイアウト幅から求める。 */
  const currentScale = (): number => {
    const stage = shadow.querySelector(".am-sm-wrap") as HTMLElement | null;
    if (!stage) return 1;
    return previewScale(stage.getBoundingClientRect().width, stage.offsetWidth);
  };

  /** ポインタの移動量（画面 px）をモックの座標（レイアウト px）へ換算する。 */
  const dragDeltaOf = (
    event: PointerEvent,
    state: { startX: number; startY: number },
  ): { dx: number; dy: number } => {
    const scale = currentScale();
    return {
      dx: (event.clientX - state.startX) / scale,
      dy: (event.clientY - state.startY) / scale,
    };
  };

  const dragOffsetOf = (
    event: PointerEvent,
    state: { path: string; startX: number; startY: number },
  ): { leftPx: number; topPx: number } => {
    const el = findRenderedElementByPath(shadow, state.path);
    const computed = el ? globalThis.getComputedStyle(el) : null;
    const base = (value: string | undefined): number => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const isOffsetPositioned = computed?.position === "relative" || computed?.position === "absolute";
    const { dx, dy } = dragDeltaOf(event, state);
    return {
      leftPx: (isOffsetPositioned ? base(computed?.left) : 0) + dx,
      topPx: (isOffsetPositioned ? base(computed?.top) : 0) + dy,
    };
  };

  /**
   * ドラッグ中、掴んでいる要素をカーソルへ追従させる（見た目のみ）。
   *
   * `transform` はレイアウトに影響しないため、周囲を動かさずに着地位置を予告できる。
   * ヒットテスト（ドロップ先の解決）で自分自身を拾わないよう pointer-events も落とす。
   */
  const applyDragGhost = (event: PointerEvent, state: { path: string; startX: number; startY: number }): void => {
    const el = findRenderedElementByPath(shadow, state.path);
    if (!el) return;
    const { dx, dy } = dragDeltaOf(event, state);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.pointerEvents = "none";
    el.style.opacity = DRAG_GHOST_OPACITY;
  };

  /** 追従表示を戻す（書き戻しで再描画される場合も、しない場合も確実に戻す）。 */
  const clearDragGhost = (path: string): void => {
    const el = findRenderedElementByPath(shadow, path);
    if (!el) return;
    el.style.removeProperty("transform");
    el.style.removeProperty("pointer-events");
    el.style.removeProperty("opacity");
  };

  const clearDragFeedback = (): void => {
    feedbackEl?.remove();
    feedbackEl = null;
  };

  /** 挿入位置の線（並べ替え）またはモードバッジ（自由配置）をステージ上へ描く。 */
  const renderDragFeedback = (event: PointerEvent): void => {
    clearDragFeedback();
    if (drag?.kind !== "element") return;
    const stage = shadow.querySelector(".am-sm-wrap") as HTMLElement | null;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const scale = currentScale();
    const marker = document.createElement("div");

    if (drag.altKey) {
      marker.className = "am-smdm-dragbadge";
      marker.textContent = options.freePositionLabel ?? "";
      marker.style.left = `${(event.clientX - stageRect.left) / scale + 12}px`;
      marker.style.top = `${(event.clientY - stageRect.top) / scale + 12}px`;
    } else {
      const drop = resolveDropContext(event, drag.path);
      if (!drop) return;
      const container =
        drop.parentPath === "" ? stage : (findRenderedElementByPath(shadow, drop.parentPath) ?? stage);
      const siblings = Array.from(container.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.smPath !== undefined,
      );
      const sibling = siblings[drop.index];
      const rect = (sibling ?? siblings.at(-1) ?? container).getBoundingClientRect();
      const atEnd = !sibling;
      marker.className = "am-smdm-insertline";
      if (drop.direction === "horizontal") {
        marker.style.left = `${((atEnd ? rect.right : rect.left) - stageRect.left) / scale}px`;
        marker.style.top = `${(rect.top - stageRect.top) / scale}px`;
        marker.style.width = "2px";
        marker.style.height = `${rect.height / scale}px`;
      } else {
        marker.style.left = `${(rect.left - stageRect.left) / scale}px`;
        marker.style.top = `${((atEnd ? rect.bottom : rect.top) - stageRect.top) / scale}px`;
        marker.style.width = `${rect.width / scale}px`;
        marker.style.height = "2px";
      }
    }

    stage.appendChild(marker);
    feedbackEl = marker;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.kind === "element") {
      drag.moved ||=
        Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
      drag.altKey = event.altKey;
      if (drag.moved) {
        applyDragGhost(event, drag);
        renderDragFeedback(event);
      }
      return;
    }
    if (!selectedEl) return;
    const { dx, dy } = dragDeltaOf(event, drag);
    if (drag.handle === "e" || drag.handle === "se") {
      drag.width = Math.max(1, drag.startWidth + dx);
      selectedEl.style.width = `${drag.width}px`;
    }
    if (drag.handle === "s" || drag.handle === "se") {
      drag.height = Math.max(1, drag.startHeight + dy);
      selectedEl.style.height = `${drag.height}px`;
    }
    renderSelection();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    clearDragFeedback();
    const sourceText = options.getSource();
    const screenHtml = parseScreenmock(sourceText)[current.screenIndex]?.html ?? "";

    if (current.kind === "element") {
      if (!current.moved) {
        clearDragGhost(current.path);
        return;
      }
      // ドロップ先の解決は追従表示（pointer-events: none）を外す前に行う。先に外すと
      // ヒットテストが掴んでいる要素自身を拾い、挿入位置がドラッグ中の表示とずれる。
      const drop = current.altKey ? null : resolveDropContext(event, current.path);
      clearDragGhost(current.path);
      const nextScreenHtml = current.altKey
        ? applyElementOffset(screenHtml, current.path, dragOffsetOf(event, current))
        : drop
          ? moveScreenmockElement(screenHtml, current.path, drop.parentPath, drop.index)
          : screenHtml;
      if (nextScreenHtml === screenHtml) return;
      options.setSource(replaceScreenmockScreenHtml(sourceText, current.screenIndex, nextScreenHtml));
      return;
    }

    const nextScreenHtml = applyElementSizeToScreenHtml(screenHtml, current.path, {
      widthPercent: (current.width / current.parentWidth) * 100,
      heightPx: current.height,
    });
    options.setSource(replaceScreenmockScreenHtml(sourceText, current.screenIndex, nextScreenHtml));
  };

  /**
   * ポインタがキャンセルされた場合（タッチのスクロール判定・フォーカス喪失等）は書き戻さず
   * 状態だけ落とす。これが無いと挿入線やバッジが消えずに残る。
   */
  const onPointerCancel = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const cancelled = drag;
    drag = null;
    clearDragFeedback();
    if (cancelled.kind === "element") clearDragGhost(cancelled.path);
  };

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
  host.destroy = () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);
    clearDragFeedback();
    host.remove();
  };
  render();
  scheduleConnectedRerender(host, render);
  return host;
}
