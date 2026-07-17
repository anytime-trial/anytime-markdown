import {
  SCREENMOCK_VARS,
  collectScreenmockThemeVars,
  parseScreenmock,
  sanitizeScreenmockHtml,
  scheduleConnectedRerender,
} from "./screenmockPreview";

export interface ScreenmockElementSize {
  widthPercent: number;
  heightPx: number;
}

export interface CreateScreenmockDesignModePreviewOptions {
  source: string;
  getSource: () => string;
  setSource: (source: string) => void;
  emptyHint?: string;
  tabListLabel?: string;
  initialSelectedPath?: string;
  onSelectionChange?: (path: string | null) => void;
}

export interface ScreenmockDesignModePreviewElement extends HTMLElement {
  destroy: () => void;
}

function elementPathOf(path: string): number[] | null {
  if (!path) return null;
  const parts = path.split("/").map((part) => Number(part));
  return parts.every((part) => Number.isInteger(part) && part >= 0) ? parts : null;
}

function findElementByPath(root: DocumentFragment | Element, path: string): Element | null {
  const parts = elementPathOf(path);
  if (!parts) return null;
  let current: DocumentFragment | Element = root;
  for (const index of parts) {
    const children = Array.from(current.children);
    const next = children[index];
    if (!next) return null;
    current = next;
  }
  return current instanceof Element ? current : null;
}

function annotateElementPaths(root: DocumentFragment | Element, prefix = ""): void {
  Array.from(root.children).forEach((child, index) => {
    const path = prefix ? `${prefix}/${index}` : String(index);
    child.setAttribute("data-sm-path", path);
    annotateElementPaths(child, path);
  });
}

export function annotateScreenmockHtmlPaths(screenHtml: string): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  annotateElementPaths(template.content);
  return template.innerHTML;
}

function removePathAttributes(root: DocumentFragment | Element): void {
  root.querySelectorAll("[data-sm-path]").forEach((el) => el.removeAttribute("data-sm-path"));
}

function mergeStyleAttribute(style: string | null, next: Record<string, string>): string {
  const declarations: Array<[string, string]> = [];
  const indexByName = new Map<string, number>();
  for (const rawPart of (style ?? "").split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (!name || !value) continue;
    indexByName.set(name.toLowerCase(), declarations.length);
    declarations.push([name, value]);
  }
  for (const [name, value] of Object.entries(next)) {
    const existing = indexByName.get(name.toLowerCase());
    if (existing === undefined) {
      indexByName.set(name.toLowerCase(), declarations.length);
      declarations.push([name, value]);
    } else {
      declarations[existing] = [declarations[existing][0], value];
    }
  }
  return declarations.map(([name, value]) => `${name}: ${value};`).join(" ");
}

export function applyElementSizeToScreenHtml(
  screenHtml: string,
  path: string,
  size: ScreenmockElementSize,
): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  const target = findElementByPath(template.content, path) as HTMLElement | null;
  if (target) {
    target.setAttribute(
      "style",
      mergeStyleAttribute(target.getAttribute("style"), {
        width: `${size.widthPercent.toFixed(1)}%`,
        height: `${Math.round(size.heightPx)}px`,
      }),
    );
  }
  removePathAttributes(template.content);
  return template.innerHTML;
}

interface ScreenRange {
  bodyStart: number;
  bodyEnd: number;
}

function isDelimiter(line: string): boolean {
  return line.trim() === "---";
}

function parseFrontmatter(lines: string[]): { id?: string; title?: string } | null {
  const result: { id?: string; title?: string } = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) return null;
    if (match[1] === "id") result.id = match[2].trim();
    if (match[1] === "title") result.title = match[2].trim();
  }
  return result;
}

function parseScreenRanges(source: string): ScreenRange[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex < 0) return [];
  if (!isDelimiter(lines[firstContentIndex])) {
    return [{ bodyStart: 0, bodyEnd: lines.length }];
  }

  const ranges: ScreenRange[] = [];
  let cursor = firstContentIndex;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    if (cursor >= lines.length) break;
    if (!isDelimiter(lines[cursor])) {
      ranges.push({ bodyStart: cursor, bodyEnd: lines.length });
      break;
    }
    cursor += 1;
    const fmStart = cursor;
    while (cursor < lines.length && !isDelimiter(lines[cursor])) cursor += 1;
    if (cursor >= lines.length) break;
    const frontmatter = lines.slice(fmStart, cursor);
    cursor += 1;
    const bodyStart = cursor;
    while (cursor < lines.length && !isDelimiter(lines[cursor])) cursor += 1;
    if (parseFrontmatter(frontmatter)) {
      ranges.push({ bodyStart, bodyEnd: cursor });
    }
  }
  return ranges;
}

export function replaceScreenmockScreenHtml(source: string, screenIndex: number, nextScreenHtml: string): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const range = parseScreenRanges(normalized)[screenIndex];
  if (!range) return normalized;
  if (range.bodyStart === 0 && range.bodyEnd === lines.length) return nextScreenHtml;
  const nextLines = nextScreenHtml.split("\n");
  return [...lines.slice(0, range.bodyStart), ...nextLines, ...lines.slice(range.bodyEnd)].join("\n");
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
.am-smdm-stage .sm-screen{display:block;position:relative;min-height:100%;background:var(--sm-paper,#fff);border:0;border-radius:0;overflow:hidden;}
`;

const SCREENMOCK_DESIGN_PROTECTION_STYLE = `
.am-smdm-tabs{display:flex !important;position:relative !important;visibility:visible !important;pointer-events:auto !important;z-index:20 !important;}
.am-smdm-selection{display:block !important;position:absolute !important;visibility:visible !important;border:2px solid var(--sm-primary,#0969da) !important;background:transparent !important;pointer-events:none !important;z-index:10 !important;}
.am-smdm-handle{display:block !important;position:absolute !important;visibility:visible !important;width:10px !important;height:10px !important;padding:0 !important;border:1px solid var(--sm-primary,#0969da) !important;background:var(--sm-on-primary,#fff) !important;pointer-events:auto !important;z-index:11 !important;}
.am-smdm-stage{display:block !important;position:relative !important;visibility:visible !important;pointer-events:auto !important;z-index:0 !important;border:1px solid var(--am-color-divider,#d0d7de) !important;background:var(--sm-bg,#f6f8fa) !important;}
.am-smdm-handle-e{right:-6px;top:50%;transform:translateY(-50%);cursor:ew-resize;}
.am-smdm-handle-s{left:50%;bottom:-6px;transform:translateX(-50%);cursor:ns-resize;}
.am-smdm-handle-se{right:-6px;bottom:-6px;cursor:nwse-resize;}
`;

export function createScreenmockDesignModePreview(
  options: CreateScreenmockDesignModePreviewOptions,
): ScreenmockDesignModePreviewElement {
  const host = document.createElement("div") as ScreenmockDesignModePreviewElement;
  host.className = "am-screenmock-design-preview";
  host.style.cssText = "display:block;width:100%;max-width:100%;height:100%;min-height:360px;";
  const shadow = host.attachShadow({ mode: "open" });

  let activeIndex = 0;
  let selectedPath: string | null = options.initialSelectedPath ?? null;
  let selectedEl: HTMLElement | null = null;
  let selectionEl: HTMLElement | null = null;
  let drag:
    | {
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
    | null = null;

  const renderSelection = (): void => {
    selectionEl?.remove();
    selectionEl = null;
    if (!selectedEl) return;
    const screen = shadow.querySelector(".sm-screen") as HTMLElement | null;
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
    if (el.classList.contains("sm-screen")) return;
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
      ? `<section class="sm-screen" id="${escapeHtml(activeScreen.id)}">${sanitizeScreenmockHtml(
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
    shadow.querySelector(".sm-screen")?.addEventListener("click", (event) => {
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
    renderSelection();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || !selectedEl || event.pointerId !== drag.pointerId) return;
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
    const nextScreenHtml = applyElementSizeToScreenHtml(
      parseScreenmock(options.getSource())[drag.screenIndex]?.html ?? "",
      drag.path,
      { widthPercent: (drag.width / drag.parentWidth) * 100, heightPx: drag.height },
    );
    const nextSource = replaceScreenmockScreenHtml(options.getSource(), drag.screenIndex, nextScreenHtml);
    drag = null;
    options.setSource(nextSource);
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
