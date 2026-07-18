import {
  SCREENMOCK_VARS,
  collectScreenmockThemeVars,
  parseScreenmock,
  sanitizeScreenmockHtml,
  scheduleConnectedRerender,
} from "./screenmockPreview";
import {
  annotateScreenmockHtmlPaths,
  applyElementAbsolutePosition,
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
    const overlay = document.createElement("div");
    overlay.className = "am-smdm-selection";
    overlay.style.left = `${rect.left - screenRect.left}px`;
    overlay.style.top = `${rect.top - screenRect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
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
        drag = {
          kind: "resize",
          pointerId: event.pointerId,
          handle,
          path: selectedPath,
          screenIndex: activeIndex,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: selectedRect.width,
          startHeight: selectedRect.height,
          parentWidth: Math.max(parentRect.width, 1),
          width: selectedRect.width,
          height: selectedRect.height,
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
    shadow.querySelector(".am-sm-wrap")?.addEventListener("pointerdown", (event) => {
      const pointerEvent = event as PointerEvent;
      const el = (pointerEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-sm-path]");
      // 画面ルート（sm-screen）は移動対象外。ドロップ先コンテナとしてのみ使う。
      if (!el?.dataset.smPath || el.classList.contains("sm-screen")) return;
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

  /** 自由配置のドロップ座標を、対象要素の親要素基準の px へ変換する。 */
  const dropPositionOf = (
    event: PointerEvent,
    state: { path: string; startX: number; startY: number },
  ): { leftPx: number; topPx: number } => {
    const el = findRenderedElementByPath(shadow, state.path);
    const parent = el?.parentElement;
    if (!el || !parent) return { leftPx: 0, topPx: 0 };
    const elRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return {
      leftPx: elRect.left - parentRect.left + (event.clientX - state.startX),
      topPx: elRect.top - parentRect.top + (event.clientY - state.startY),
    };
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
    const marker = document.createElement("div");

    if (drag.altKey) {
      marker.className = "am-smdm-dragbadge";
      marker.textContent = options.freePositionLabel ?? "";
      marker.style.left = `${event.clientX - stageRect.left + 12}px`;
      marker.style.top = `${event.clientY - stageRect.top + 12}px`;
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
        marker.style.left = `${(atEnd ? rect.right : rect.left) - stageRect.left}px`;
        marker.style.top = `${rect.top - stageRect.top}px`;
        marker.style.width = "2px";
        marker.style.height = `${rect.height}px`;
      } else {
        marker.style.left = `${rect.left - stageRect.left}px`;
        marker.style.top = `${(atEnd ? rect.bottom : rect.top) - stageRect.top}px`;
        marker.style.width = `${rect.width}px`;
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
      if (drag.moved) renderDragFeedback(event);
      return;
    }
    if (!selectedEl) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
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
      if (!current.moved) return;
      const drop = current.altKey ? null : resolveDropContext(event, current.path);
      const nextScreenHtml = current.altKey
        ? applyElementAbsolutePosition(screenHtml, current.path, dropPositionOf(event, current))
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

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  host.destroy = () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    host.remove();
  };
  render();
  scheduleConnectedRerender(host, render);
  return host;
}
