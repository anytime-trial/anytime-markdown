import { getDivider, getTextDisabled, getTextSecondary } from "@anytime-markdown/markdown-viewer";
import { ensureStyle } from "./dialogHelpers";
import { parseScreenmock } from "./screenmockPreview";
import {
  appendScreenmockScreen,
  annotateScreenmockHtmlPaths,
  duplicateScreenmockElement,
  duplicateScreenmockScreen,
  findElementByPath,
  insertScreenmockElement,
  insertScreenmockFragment,
  moveScreenmockElement,
  moveScreenmockScreen,
  parseScreenRanges,
  removeScreenmockElement,
  removeScreenmockElementHeight,
  removeScreenmockScreen,
  removeScreenmockElementWidth,
  renameScreenmockScreen,
  replaceScreenmockScreenHtml,
  setScreenmockElementAttribute,
  setScreenmockElementOffset,
  setScreenmockElementStyleDeclaration,
  setScreenmockElementHeight,
  setScreenmockElementHref,
  setScreenmockElementText,
  setScreenmockElementWidth,
  toggleScreenmockElementClass,
  unwrapScreenmockElement,
  wrapScreenmockElement,
} from "./screenmockHtmlMutations";

export interface CreateScreenmockEditPanelOptions {
  getSource: () => string;
  setSource: (source: string) => void;
  t: (key: string) => string;
  getDesignMode: () => boolean;
  getSelectedPath: () => string | null;
  setSelectedPath: (path: string | null) => void;
  getActiveScreenIndex: () => number;
  setActiveScreenIndex?: (index: number) => void;
  confirm?: (message: string) => Promise<boolean> | boolean;
  isDark: boolean;
}

export interface ScreenmockEditPanelHandle {
  el: HTMLElement;
  destroy: () => void;
  setDesignMode: (enabled: boolean) => void;
  setSelection: (path: string | null) => void;
  setActiveScreenIndex: (index: number) => void;
  render: () => void;
}

type PanelTab = "parts" | "attributes" | "structure" | "screens";

interface PartItem {
  className: string;
  html: string;
}

interface SnippetItem {
  labelKey: string;
  html: string;
}

interface ScreenTemplateItem {
  labelKey: string;
  idPrefix: string;
  titleKey: string;
  html: string;
}

interface ScreenMetadata {
  id?: string;
  title?: string;
}

export const SCREENMOCK_PALETTE_DRAG_EVENT = "am-screenmock-palette-drag-start";

const STYLE_ID = "am-screenmock-edit-panel";

const LAYOUT_PARTS: PartItem[] = [
  { className: "sm-header", html: '<div class="sm-header">Header</div>' },
  { className: "sm-sidebar", html: '<aside class="sm-sidebar">Sidebar</aside>' },
  { className: "sm-main", html: '<main class="sm-main"></main>' },
  { className: "sm-footer", html: '<div class="sm-footer">Footer</div>' },
  { className: "sm-row", html: '<div class="sm-row"></div>' },
  { className: "sm-col", html: '<div class="sm-col"></div>' },
];

const COMPONENT_PARTS: PartItem[] = [
  { className: "sm-card", html: '<div class="sm-card">Card</div>' },
  { className: "sm-btn", html: '<button class="sm-btn">Button</button>' },
  { className: "sm-btn-primary", html: '<button class="sm-btn sm-btn-primary">Primary</button>' },
  { className: "sm-input", html: '<input class="sm-input" placeholder="Input">' },
  { className: "sm-table", html: '<table class="sm-table"><tbody><tr><td>Cell</td></tr></tbody></table>' },
  { className: "sm-list", html: '<ul class="sm-list"><li>Item</li></ul>' },
  { className: "sm-badge", html: '<span class="sm-badge">Badge</span>' },
  { className: "sm-heading", html: '<h2 class="sm-heading">Heading</h2>' },
  { className: "sm-text", html: '<span class="sm-text" data-lines="3"></span>' },
  { className: "sm-img", html: '<div class="sm-img"></div>' },
];

const SNIPPETS: SnippetItem[] = [
  {
    labelKey: "screenmockPanelSnippetForm",
    html: '<input class="sm-input" placeholder="Email"><button class="sm-btn sm-btn-primary">Submit</button>',
  },
  {
    labelKey: "screenmockPanelSnippetHeader",
    html: '<div class="sm-header"><h1 class="sm-heading">Title</h1></div>',
  },
];

const SCREEN_TEMPLATES: ScreenTemplateItem[] = [
  {
    labelKey: "screenmockPanelTemplateLogin",
    idPrefix: "login",
    titleKey: "screenmockPanelTemplateLoginTitle",
    html: '<div class="sm-screen">\n  <div class="sm-main">\n    <div class="sm-card">\n      <h1 class="sm-heading">Login</h1>\n      <input class="sm-input" placeholder="Email">\n      <input class="sm-input" placeholder="Password">\n      <button class="sm-btn sm-btn-primary">Sign in</button>\n    </div>\n  </div>\n</div>',
  },
  {
    labelKey: "screenmockPanelTemplateList",
    idPrefix: "list",
    titleKey: "screenmockPanelTemplateListTitle",
    html: '<div class="sm-screen">\n  <div class="sm-header"><h1 class="sm-heading">Items</h1></div>\n  <main class="sm-main">\n    <div class="sm-row">\n      <button class="sm-btn sm-btn-primary">New</button>\n      <input class="sm-input" placeholder="Search">\n    </div>\n    <table class="sm-table"><tbody><tr><td>Name</td><td>Status</td></tr><tr><td>Sample</td><td><span class="sm-badge">Open</span></td></tr></tbody></table>\n  </main>\n</div>',
  },
  {
    labelKey: "screenmockPanelTemplateDetail",
    idPrefix: "detail",
    titleKey: "screenmockPanelTemplateDetailTitle",
    html: '<div class="sm-screen">\n  <div class="sm-header"><h1 class="sm-heading">Detail</h1></div>\n  <main class="sm-main">\n    <div class="sm-card">\n      <div class="sm-img"></div>\n      <span class="sm-text" data-lines="4"></span>\n      <div class="sm-row"><button class="sm-btn">Cancel</button><button class="sm-btn sm-btn-primary">Save</button></div>\n    </div>\n  </main>\n</div>',
  },
];

const STYLE_PRESETS: Record<string, Record<"none" | "sm" | "md" | "lg", string | null>> = {
  padding: { none: null, sm: "8px", md: "16px", lg: "24px" },
  gap: { none: null, sm: "8px", md: "12px", lg: "20px" },
  "border-radius": { none: null, sm: "4px", md: "8px", lg: "12px" },
};

const JUSTIFY_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "screenmockPanelAlignDefault" },
  { value: "flex-start", labelKey: "screenmockPanelAlignStart" },
  { value: "center", labelKey: "screenmockPanelAlignCenter" },
  { value: "flex-end", labelKey: "screenmockPanelAlignEnd" },
];

const ALIGN_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "screenmockPanelAlignDefault" },
  { value: "flex-start", labelKey: "screenmockPanelAlignStart" },
  { value: "center", labelKey: "screenmockPanelAlignCenter" },
  { value: "stretch", labelKey: "screenmockPanelAlignStretch" },
];

const COLOR_TOKENS = [
  "--sm-primary",
  "--sm-paper",
  "--sm-bg",
  "--sm-text",
  "--sm-muted",
  "--sm-on-primary",
  "--am-color-error-main",
  "--am-color-success-main",
  "--am-color-warning-main",
];

const COLOR_TOKEN_FALLBACKS: Record<string, string> = {
  "--sm-primary": "#0969da",
  "--sm-paper": "#ffffff",
  "--sm-bg": "#f6f8fa",
  "--sm-text": "#1f2328",
  "--sm-muted": "#656d76",
  "--sm-on-primary": "#ffffff",
  "--am-color-error-main": "#d1242f",
  "--am-color-success-main": "#1a7f37",
  "--am-color-warning-main": "#9a6700",
};

function ensurePanelStyle(): void {
  ensureStyle(STYLE_ID, `
.am-smep{display:flex;flex-direction:column;min-height:100%;font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--am-color-text-primary,#1f2328);}
.am-smep-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--am-color-divider,#d0d7de);}
.am-smep-tab{min-width:0;padding:8px 2px;border:0;border-right:1px solid var(--am-color-divider,#d0d7de);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;}
.am-smep-tab:last-child{border-right:0;}
.am-smep-tab[aria-selected="true"]{background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);font-weight:600;}
.am-smep-body{position:relative;flex:1 1 auto;min-height:0;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:10px;}
.am-smep-disabled{opacity:.48;pointer-events:none;}
.am-smep-disabled-note{padding:8px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;color:var(--am-color-text-secondary,#656d76);background:var(--am-color-action-hover,rgba(0,0,0,.05));}
.am-smep-section{display:flex;flex-direction:column;gap:6px;}
.am-smep-heading{font-size:12px;font-weight:700;color:var(--am-color-text-secondary,#656d76);}
.am-smep-grid{display:grid;grid-template-columns:1fr;gap:6px;}
.am-smep-part,.am-smep-action{min-height:30px;padding:5px 8px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-bg-paper,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;}
.am-smep-part:hover,.am-smep-action:hover{background:var(--am-color-action-hover,rgba(0,0,0,.06));}
.am-smep-action-danger{color:var(--am-color-error-main,#d1242f);}
.am-smep-field{display:flex;flex-direction:column;gap:4px;}
.am-smep-field label{font-size:12px;color:var(--am-color-text-secondary,#656d76);}
.am-smep-field input,.am-smep-field select{width:100%;min-height:30px;padding:4px 7px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-bg-paper,#fff);color:inherit;font:inherit;box-sizing:border-box;}
.am-smep-palette{display:grid;grid-template-columns:1fr;gap:4px;}
.am-smep-token{display:flex;align-items:center;gap:7px;min-height:28px;padding:4px 7px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-bg-paper,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;}
.am-smep-token[aria-pressed="true"]{border-color:var(--am-color-primary-main,#0969da);background:var(--am-color-action-selected,rgba(9,105,218,.12));}
.am-smep-swatch{flex:0 0 auto;width:14px;height:14px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:3px;background:var(--am-smep-swatch,#fff);}
.am-smep-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.am-smep-row-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;}
.am-smep-muted{color:var(--am-color-text-secondary,#656d76);font-size:12px;}
.am-smep-chip{display:inline-flex;width:max-content;max-width:100%;padding:2px 7px;border-radius:999px;background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);font-size:12px;font-weight:600;}
.am-smep-screen-list{display:flex;flex-direction:column;gap:6px;}
.am-smep-screen,.am-smep-tree-node{width:100%;min-height:30px;padding:5px 8px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-bg-paper,#fff);color:inherit;font:inherit;text-align:left;box-sizing:border-box;cursor:pointer;}
.am-smep-screen[aria-current="true"],.am-smep-tree-node[aria-selected="true"]{border-color:var(--am-color-primary-main,#0969da);background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);font-weight:600;}
.am-smep-tree{display:flex;flex-direction:column;gap:4px;}
.am-smep-tree-node{position:relative;}
.am-smep-tree-node[aria-dropeffect="move"]{outline:2px solid var(--am-color-primary-main,#0969da);outline-offset:1px;}
.am-smep-segment{display:flex;gap:4px;flex-wrap:wrap;}
.am-smep-segment .am-smep-action{flex:1 1 auto;text-align:center;}
.am-smep-segment .am-smep-action[aria-pressed="true"]{border-color:var(--am-color-primary-main,#0969da);background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);font-weight:600;}
`);
}

function text(key: string, opts: CreateScreenmockEditPanelOptions): string {
  const value = opts.t(key);
  return value || key;
}

function normalizeActiveScreenIndex(source: string, index: number): number {
  const count = parseScreenRanges(source).length || parseScreenmock(source).length;
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

function screenHtmlAt(source: string, screenIndex: number): string {
  return parseScreenmock(source)[screenIndex]?.html ?? "";
}

function readElement(source: string, screenIndex: number, path: string | null): HTMLElement | null {
  if (!path) return null;
  const template = document.createElement("template");
  template.innerHTML = screenHtmlAt(source, screenIndex);
  const found = findElementByPath(template.content, path);
  return found instanceof HTMLElement ? found : null;
}

function classOrTag(el: Element | null): string {
  if (!el) return "";
  const smClass = Array.from(el.classList).find((name) => name.startsWith("sm-"));
  return smClass ?? el.tagName.toLowerCase();
}

function readStyleDeclaration(style: string | null, name: string): string {
  for (const part of (style ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    if (part.slice(0, colon).trim().toLowerCase() === name) {
      return part.slice(colon + 1).trim();
    }
  }
  return "";
}

function readPxDeclaration(style: string | null, name: string): string {
  const value = readStyleDeclaration(style, name).replace(/px$/i, "").trim();
  if (!value) return "";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function readDirectText(el: Element | null): string {
  if (!el) return "";
  if (["input", "textarea"].includes(el.tagName.toLowerCase())) return el.getAttribute("placeholder") ?? "";
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

function childCount(source: string, screenIndex: number, containerPath: string): number {
  const template = document.createElement("template");
  template.innerHTML = screenHtmlAt(source, screenIndex);
  const parent = containerPath === "" ? template.content : findElementByPath(template.content, containerPath);
  return parent?.children.length ?? 0;
}

function pathExists(source: string, screenIndex: number, path: string | null): boolean {
  if (!path) return false;
  const template = document.createElement("template");
  template.innerHTML = screenHtmlAt(source, screenIndex);
  return Boolean(findElementByPath(template.content, path));
}

function hasHrefReference(source: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`href=(["'])#${escaped}\\1`).test(source);
}

function nextScreenId(source: string): string {
  const used = new Set(parseScreenmock(source).map((screen) => screen.id));
  for (let index = 1; ; index += 1) {
    const candidate = `screen-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function uniqueScreenIdFromPrefix(source: string, prefix: string): string {
  const used = new Set(parseScreenmock(source).map((screen) => screen.id));
  if (!used.has(prefix)) return prefix;
  for (let index = 2; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function readScreenMetadata(source: string): ScreenMetadata[] {
  if (!source.trim()) return [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex < 0) return [];
  if (lines[firstContentIndex].trim() !== "---") return [{}];

  const result: ScreenMetadata[] = [];
  let cursor = firstContentIndex;
  while (cursor < lines.length) {
    while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
    if (cursor >= lines.length) break;
    if (lines[cursor].trim() !== "---") {
      result.push({});
      break;
    }
    cursor += 1;
    const meta: ScreenMetadata = {};
    while (cursor < lines.length && lines[cursor].trim() !== "---") {
      const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[cursor]);
      if (match?.[1] === "id") meta.id = match[2].trim();
      if (match?.[1] === "title") meta.title = match[2].trim();
      cursor += 1;
    }
    if (cursor >= lines.length) break;
    result.push(meta);
    cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() !== "---") cursor += 1;
  }
  return result;
}

function presetValueOf(style: string | null, property: keyof typeof STYLE_PRESETS): string {
  const current = readStyleDeclaration(style, property);
  const preset = STYLE_PRESETS[property];
  const found = Object.entries(preset).find(([, value]) => value === current);
  return found?.[0] ?? (current ? "custom" : "none");
}

function isFlexContainer(el: Element | null): boolean {
  return Boolean(el?.classList.contains("sm-row") || el?.classList.contains("sm-col"));
}

function directContainerPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function directIndex(path: string): number {
  const value = Number(path.split("/").at(-1));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function defaultContainerPath(source: string, screenIndex: number): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtmlAt(source, screenIndex);
  const first = template.content.firstElementChild;
  return first?.classList.contains("sm-screen") ? "0" : "";
}

function append<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  parent.appendChild(el);
  return el;
}

function makeButton(label: string, className = "am-smep-action"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

export function createScreenmockEditPanel(options: CreateScreenmockEditPanelOptions): ScreenmockEditPanelHandle {
  ensurePanelStyle();

  const root = document.createElement("div");
  root.className = "am-smep";
  root.style.borderColor = getDivider(options.isDark);
  root.style.color = "var(--am-color-text-primary,#1f2328)";
  root.style.setProperty("--am-smep-disabled-color", getTextDisabled(options.isDark));
  root.style.setProperty("--am-smep-muted-color", getTextSecondary(options.isDark));

  let activeTab: PanelTab = "parts";
  let selectedPath = options.getSelectedPath();
  let activeScreenIndex = normalizeActiveScreenIndex(options.getSource(), options.getActiveScreenIndex());
  let designMode = options.getDesignMode();

  const tabsEl = append(root, "div", "am-smep-tabs");
  const bodyEl = append(root, "div", "am-smep-body");

  const tabDefs: Array<{ value: PanelTab; label: string }> = [
    { value: "parts", label: text("screenmockPanelTabParts", options) },
    { value: "attributes", label: text("screenmockPanelTabAttributes", options) },
    { value: "structure", label: text("screenmockPanelTabStructure", options) },
    { value: "screens", label: text("screenmockPanelTabScreens", options) },
  ];

  const tabButtons = new Map<PanelTab, HTMLButtonElement>();
  for (const tab of tabDefs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "am-smep-tab";
    button.textContent = tab.label;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      activeTab = tab.value;
      render();
    });
    tabsEl.appendChild(button);
    tabButtons.set(tab.value, button);
  }

  // 書き戻し後の再描画はホスト側の source 購読（editState.subscribe → render()）が担う。
  // ここで render() を呼ぶと全パネル操作が二重描画になる。
  const commitSource = (source: string): void => {
    options.setSource(source);
  };

  const currentSelection = (): { source: string; screenIndex: number; path: string | null; el: HTMLElement | null } => {
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const path = pathExists(source, screenIndex, selectedPath) ? selectedPath : null;
    return { source, screenIndex, path, el: readElement(source, screenIndex, path) };
  };

  const selectPath = (path: string | null, switchTab = true): void => {
    selectedPath = path;
    options.setSelectedPath(path);
    if (switchTab) activeTab = path ? "attributes" : "parts";
  };

  const insertPart = (part: PartItem): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const containerPath = pathExists(source, screenIndex, selectedPath)
      ? selectedPath ?? ""
      : defaultContainerPath(source, screenIndex);
    const index = childCount(source, screenIndex, containerPath);
    const next = insertScreenmockElement(source, screenIndex, containerPath, part.html);
    const newPath = containerPath ? `${containerPath}/${index}` : String(index);
    selectPath(newPath);
    commitSource(next);
  };

  const insertSnippet = (snippet: SnippetItem): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const containerPath = pathExists(source, screenIndex, selectedPath)
      ? selectedPath ?? ""
      : defaultContainerPath(source, screenIndex);
    const result = insertScreenmockFragment(source, screenIndex, containerPath, snippet.html);
    if (!result.newPaths.length) return;
    selectPath(result.newPaths[0]);
    commitSource(result.source);
  };

  const addScreenTemplate = (template: ScreenTemplateItem): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screens = parseScreenmock(source);
    const next = appendScreenmockScreen(source, {
      id: uniqueScreenIdFromPrefix(source, template.idPrefix),
      title: text(template.titleKey, options),
      html: template.html,
    });
    activeScreenIndex = screens.length;
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    commitSource(next);
  };

  // 幅・高さは片側ずつの独立編集。未変更側の宣言を追加しない（両値契約の
  // applyElementSizeToScreenHtml はリサイズハンドル専用でここでは使わない）。
  const applySize = (property: "width" | "height", value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    if (!value.trim()) {
      const next = property === "width"
        ? removeScreenmockElementWidth(source, screenIndex, path)
        : removeScreenmockElementHeight(source, screenIndex, path);
      commitSource(next);
      return;
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    const next = property === "width"
      ? setScreenmockElementWidth(source, screenIndex, path, parsed)
      : setScreenmockElementHeight(source, screenIndex, path, parsed);
    commitSource(next);
  };

  const applyText = (value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    commitSource(setScreenmockElementText(source, screenIndex, path, value));
  };

  const applyHref = (value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    commitSource(setScreenmockElementHref(source, screenIndex, path, value || null));
  };

  const applyVariant = (className: string, enabled: boolean): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    commitSource(toggleScreenmockElementClass(source, screenIndex, path, className, enabled));
  };

  const applyColor = (property: "background" | "color", value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    commitSource(setScreenmockElementStyleDeclaration(source, screenIndex, path, property, value || null));
  };

  const applyStylePreset = (property: keyof typeof STYLE_PRESETS, preset: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const value = STYLE_PRESETS[property][preset as keyof typeof STYLE_PRESETS[typeof property]];
    if (value === undefined) return;
    commitSource(setScreenmockElementStyleDeclaration(source, screenIndex, path, property, value));
  };

  const applyElementAttribute = (name: "data-lines" | "src", value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    commitSource(setScreenmockElementAttribute(source, screenIndex, path, name, value.trim() || null));
  };

  const applyAlignment = (property: "justify-content" | "align-items", value: string): void => {
    const { source, screenIndex, path, el } = currentSelection();
    if (!path || !designMode || !isFlexContainer(el)) return;
    commitSource(setScreenmockElementStyleDeclaration(source, screenIndex, path, property, value || null));
  };

  const applyOffset = (property: "left" | "top", value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    commitSource(
      setScreenmockElementOffset(
        source,
        screenIndex,
        path,
        property === "left" ? { leftPx: parsed } : { topPx: parsed },
      ),
    );
  };

  const removeSelected = (): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    selectPath(null);
    commitSource(removeScreenmockElement(source, screenIndex, path));
  };

  const duplicateSelected = (): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const result = duplicateScreenmockElement(source, screenIndex, path);
    selectPath(result.newPath);
    commitSource(result.source);
  };

  const wrapSelected = (wrapperClassName: "sm-row" | "sm-col"): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const result = wrapScreenmockElement(source, screenIndex, path, wrapperClassName);
    if (result.source === source) return;
    selectPath(result.newPath, false);
    commitSource(result.source);
  };

  const unwrapSelected = (): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const next = unwrapScreenmockElement(source, screenIndex, path);
    if (next === source) return;
    selectPath(directContainerPath(path) || null, false);
    commitSource(next);
  };

  const moveSelectedTreeNode = (fromPath: string, toPath: string): void => {
    if (!designMode || fromPath === toPath || toPath.startsWith(`${fromPath}/`)) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const screenHtml = screenHtmlAt(source, screenIndex);
    const toParentPath = directContainerPath(toPath);
    const nextScreenHtml = moveScreenmockElement(screenHtml, fromPath, toParentPath, directIndex(toPath));
    if (nextScreenHtml === screenHtml) return;
    selectPath(toPath, false);
    commitSource(replaceScreenmockScreenHtml(source, screenIndex, nextScreenHtml));
  };

  const switchScreen = (index: number): void => {
    activeScreenIndex = normalizeActiveScreenIndex(options.getSource(), index);
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    render();
  };

  const addScreen = (): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screens = parseScreenmock(source);
    const next = appendScreenmockScreen(source, {
      id: nextScreenId(source),
      html: '<div class="sm-screen">\n</div>',
    });
    activeScreenIndex = screens.length;
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    commitSource(next);
  };

  const duplicateScreen = (): void => {
    if (!designMode) return;
    const source = options.getSource();
    if (!parseScreenmock(source).length) return;
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const next = duplicateScreenmockScreen(source, screenIndex);
    activeScreenIndex = screenIndex + 1;
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    commitSource(next);
  };

  const deleteScreen = async (): Promise<void> => {
    if (!designMode) return;
    const source = options.getSource();
    if (!parseScreenmock(source).length) return;
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const accepted = await (options.confirm?.(text("screenmockPanelDeleteScreenConfirm", options)) ??
      window.confirm(text("screenmockPanelDeleteScreenConfirm", options)));
    if (!accepted) return;
    const next = removeScreenmockScreen(source, screenIndex);
    activeScreenIndex = normalizeActiveScreenIndex(next, screenIndex);
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    commitSource(next);
  };

  const moveActiveScreen = (delta: -1 | 1): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const nextIndex = screenIndex + delta;
    const next = moveScreenmockScreen(source, screenIndex, nextIndex);
    if (next === source) return;
    activeScreenIndex = normalizeActiveScreenIndex(next, nextIndex);
    selectedPath = null;
    options.setSelectedPath(null);
    options.setActiveScreenIndex?.(activeScreenIndex);
    commitSource(next);
  };

  const renameActiveScreenId = async (id: string): Promise<void> => {
    if (!designMode) return;
    if (!id) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const metadata = readScreenMetadata(source)[screenIndex];
    const current = parseScreenmock(source)[screenIndex];
    const previousId = metadata?.id;
    if (!current || previousId === id) return;
    // 既存画面と重複する id は書き戻さない。表示上の自動サフィックス（§1.2）は raw の
    // 重複を隠すだけで、後の参照追従が別画面の href を巻き込む。
    const otherIds = new Set<string>();
    parseScreenmock(source).forEach((screen, index) => {
      if (index !== screenIndex) otherIds.add(screen.id);
    });
    readScreenMetadata(source).forEach((meta, index) => {
      if (index !== screenIndex && meta.id) otherIds.add(meta.id);
    });
    if (otherIds.has(id)) return;
    const updateRefs = previousId && hasHrefReference(source, previousId)
      ? await (options.confirm?.(text("screenmockPanelUpdateRefsConfirm", options)) ??
        window.confirm(text("screenmockPanelUpdateRefsConfirm", options)))
      : undefined;
    commitSource(renameScreenmockScreen(source, screenIndex, { id }, updateRefs ? { updateRefs: true } : undefined));
  };

  const renameActiveScreenTitle = (title: string): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    commitSource(renameScreenmockScreen(source, screenIndex, { title }));
  };

  const renderParts = (): void => {
    const disabledNote = append(bodyEl, "div", "am-smep-disabled-note");
    disabledNote.textContent = text("screenmockPanelDesignOff", options);
    disabledNote.style.display = designMode ? "none" : "";

    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    const addGroup = (label: string, parts: PartItem[]): void => {
      const section = append(content, "section", "am-smep-section");
      append(section, "div", "am-smep-heading").textContent = label;
      const grid = append(section, "div", "am-smep-grid");
      for (const part of parts) {
        const button = makeButton(part.className, "am-smep-part");
        button.addEventListener("click", () => insertPart(part));
        button.addEventListener("pointerdown", (event) => {
          if (!designMode) return;
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          document.dispatchEvent(
            new CustomEvent(SCREENMOCK_PALETTE_DRAG_EVENT, {
              detail: {
                html: part.html,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
              },
            }),
          );
        });
        grid.appendChild(button);
      }
    };
    addGroup(text("screenmockPanelCategoryLayout", options), LAYOUT_PARTS);
    addGroup(text("screenmockPanelCategoryComponents", options), COMPONENT_PARTS);

    const snippets = append(content, "section", "am-smep-section");
    append(snippets, "div", "am-smep-heading").textContent = text("screenmockPanelCategorySnippets", options);
    const snippetGrid = append(snippets, "div", "am-smep-grid");
    for (const snippet of SNIPPETS) {
      const button = makeButton(text(snippet.labelKey, options), "am-smep-part");
      button.addEventListener("click", () => insertSnippet(snippet));
      snippetGrid.appendChild(button);
    }

    const templates = append(content, "section", "am-smep-section");
    append(templates, "div", "am-smep-heading").textContent = text("screenmockPanelCategoryScreenTemplates", options);
    const templateGrid = append(templates, "div", "am-smep-grid");
    for (const template of SCREEN_TEMPLATES) {
      const button = makeButton(text(template.labelKey, options), "am-smep-part");
      button.addEventListener("click", () => addScreenTemplate(template));
      templateGrid.appendChild(button);
    }
  };

  const renderActions = (parent: HTMLElement): void => {
    const row = append(parent, "div", "am-smep-row");
    const duplicateButton = makeButton(text("screenmockPanelDuplicate", options));
    duplicateButton.addEventListener("click", duplicateSelected);
    row.appendChild(duplicateButton);
    const deleteButton = makeButton(text("screenmockPanelDelete", options), "am-smep-action am-smep-action-danger");
    deleteButton.addEventListener("click", removeSelected);
    row.appendChild(deleteButton);
  };

  const renderAttributes = (): void => {
    const { source, el } = currentSelection();
    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    if (!el) {
      append(content, "div", "am-smep-muted").textContent = text("screenmockPanelNoSelection", options);
      return;
    }

    const typeSection = append(content, "section", "am-smep-section");
    append(typeSection, "div", "am-smep-heading").textContent = text("screenmockPanelElementType", options);
    append(typeSection, "div", "am-smep-chip").textContent = classOrTag(el);

    const size = append(content, "section", "am-smep-section");
    append(size, "div", "am-smep-heading").textContent = text("screenmockPanelSize", options);
    const sizeRow = append(size, "div", "am-smep-row");
    const widthField = append(sizeRow, "div", "am-smep-field");
    append(widthField, "label").textContent = text("screenmockPanelWidth", options);
    const widthInput = append(widthField, "input");
    widthInput.type = "number";
    widthInput.step = "0.1";
    widthInput.value = readStyleDeclaration(el.getAttribute("style"), "width").replace(/%$/, "");
    widthInput.addEventListener("change", () => applySize("width", widthInput.value));
    const heightField = append(sizeRow, "div", "am-smep-field");
    append(heightField, "label").textContent = text("screenmockPanelHeight", options);
    const heightInput = append(heightField, "input");
    heightInput.type = "number";
    heightInput.step = "1";
    heightInput.value = readStyleDeclaration(el.getAttribute("style"), "height").replace(/px$/, "");
    heightInput.addEventListener("change", () => applySize("height", heightInput.value));

    const colors = append(content, "section", "am-smep-section");
    append(colors, "div", "am-smep-heading").textContent = text("screenmockPanelColors", options);
    const renderColorField = (property: "background" | "color", labelKey: string): void => {
      const field = append(colors, "div", "am-smep-field");
      append(field, "label").textContent = text(labelKey, options);
      const palette = append(field, "div", "am-smep-palette");
      const current = readStyleDeclaration(el.getAttribute("style"), property);
      const defaultButton = makeButton(text("screenmockPanelDefault", options), "am-smep-token");
      defaultButton.setAttribute("aria-pressed", String(!current));
      defaultButton.addEventListener("click", () => applyColor(property, ""));
      const defaultSwatch = append(defaultButton, "span", "am-smep-swatch");
      defaultSwatch.style.background = "transparent";
      palette.appendChild(defaultButton);
      for (const token of COLOR_TOKENS) {
        const value = `var(${token})`;
        const button = makeButton(token, "am-smep-token");
        button.setAttribute("aria-pressed", String(current === value));
        button.style.setProperty("--am-smep-swatch", `var(${token},${COLOR_TOKEN_FALLBACKS[token]})`);
        const swatch = document.createElement("span");
        swatch.className = "am-smep-swatch";
        button.prepend(swatch);
        button.addEventListener("click", () => applyColor(property, value));
        palette.appendChild(button);
      }
    };
    renderColorField("background", "screenmockPanelBackgroundColor");
    renderColorField("color", "screenmockPanelTextColor");

    const renderSpacingPresets = (): void => {
      const spacing = append(content, "section", "am-smep-section");
      append(spacing, "div", "am-smep-heading").textContent = text("screenmockPanelSpacing", options);
      const renderPresetField = (property: keyof typeof STYLE_PRESETS, labelKey: string): void => {
        const field = append(spacing, "div", "am-smep-field");
        append(field, "label").textContent = text(labelKey, options);
        const select = append(field, "select");
        for (const [value, labelKeyForOption] of [
          ["none", "screenmockPanelPresetNone"],
          ["sm", "screenmockPanelPresetSmall"],
          ["md", "screenmockPanelPresetMedium"],
          ["lg", "screenmockPanelPresetLarge"],
        ] as const) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text(labelKeyForOption, options);
          select.appendChild(option);
        }
        select.value = presetValueOf(el.getAttribute("style"), property);
        if (select.value === "custom") {
          const option = document.createElement("option");
          option.value = "custom";
          option.textContent = text("screenmockPanelPresetCustom", options);
          select.appendChild(option);
          select.value = "custom";
        }
        select.addEventListener("change", () => applyStylePreset(property, select.value));
      };
      renderPresetField("padding", "screenmockPanelPadding");
      renderPresetField("gap", "screenmockPanelGap");
      renderPresetField("border-radius", "screenmockPanelBorderRadius");
    };

    const offset = append(content, "section", "am-smep-section");
    append(offset, "div", "am-smep-heading").textContent = text("screenmockPanelOffset", options);
    const offsetRow = append(offset, "div", "am-smep-row");
    const leftField = append(offsetRow, "div", "am-smep-field");
    append(leftField, "label").textContent = text("screenmockPanelOffsetLeft", options);
    const leftInput = append(leftField, "input");
    leftInput.type = "number";
    leftInput.step = "1";
    leftInput.value = readPxDeclaration(el.getAttribute("style"), "left");
    leftInput.addEventListener("change", () => applyOffset("left", leftInput.value));
    const topField = append(offsetRow, "div", "am-smep-field");
    append(topField, "label").textContent = text("screenmockPanelOffsetTop", options);
    const topInput = append(topField, "input");
    topInput.type = "number";
    topInput.step = "1";
    topInput.value = readPxDeclaration(el.getAttribute("style"), "top");
    topInput.addEventListener("change", () => applyOffset("top", topInput.value));

    const textField = append(content, "div", "am-smep-field");
    append(textField, "label").textContent = ["input", "textarea"].includes(el.tagName.toLowerCase())
      ? text("screenmockPanelPlaceholder", options)
      : text("screenmockPanelText", options);
    const textInput = append(textField, "input");
    textInput.value = readDirectText(el);
    textInput.addEventListener("change", () => applyText(textInput.value));

    if (el.tagName.toLowerCase() === "a") {
      const hrefField = append(content, "div", "am-smep-field");
      append(hrefField, "label").textContent = text("screenmockPanelHref", options);
      const select = append(hrefField, "select");
      const none = document.createElement("option");
      none.value = "";
      none.textContent = text("screenmockPanelHrefNone", options);
      select.appendChild(none);
      for (const screen of parseScreenmock(source)) {
        const option = document.createElement("option");
        option.value = screen.id;
        option.textContent = `${screen.id} ${screen.title}`;
        select.appendChild(option);
      }
      select.value = (el.getAttribute("href") ?? "").startsWith("#") ? (el.getAttribute("href") ?? "").slice(1) : "";
      select.addEventListener("change", () => applyHref(select.value));
    }

    if (el.classList.contains("sm-btn") || el.classList.contains("sm-sidebar")) {
      const variantField = append(content, "div", "am-smep-field");
      append(variantField, "label").textContent = text("screenmockPanelVariant", options);
      const variant = append(variantField, "select");
      if (el.classList.contains("sm-btn")) {
        const standard = document.createElement("option");
        standard.value = "standard";
        standard.textContent = text("screenmockPanelVariantStandard", options);
        variant.appendChild(standard);
        const primary = document.createElement("option");
        primary.value = "primary";
        primary.textContent = text("screenmockPanelVariantPrimary", options);
        variant.appendChild(primary);
        variant.value = el.classList.contains("sm-btn-primary") ? "primary" : "standard";
        variant.addEventListener("change", () => applyVariant("sm-btn-primary", variant.value === "primary"));
      } else {
        const left = document.createElement("option");
        left.value = "left";
        left.textContent = text("screenmockPanelVariantLeft", options);
        variant.appendChild(left);
        const right = document.createElement("option");
        right.value = "right";
        right.textContent = text("screenmockPanelVariantRight", options);
        variant.appendChild(right);
        variant.value = el.classList.contains("sm-sidebar-right") ? "right" : "left";
        variant.addEventListener("change", () => applyVariant("sm-sidebar-right", variant.value === "right"));
      }
    }

    renderSpacingPresets();

    if (el.classList.contains("sm-text")) {
      const linesField = append(content, "div", "am-smep-field");
      append(linesField, "label").textContent = text("screenmockPanelDataLines", options);
      const input = append(linesField, "input");
      input.type = "number";
      input.step = "1";
      input.min = "1";
      input.value = el.getAttribute("data-lines") ?? "";
      input.addEventListener("change", () => applyElementAttribute("data-lines", input.value));
    }

    if (el.classList.contains("sm-img")) {
      const srcField = append(content, "div", "am-smep-field");
      append(srcField, "label").textContent = text("screenmockPanelSrc", options);
      const input = append(srcField, "input");
      input.type = "url";
      input.value = el.getAttribute("src") ?? "";
      input.addEventListener("change", () => applyElementAttribute("src", input.value));
    }

    if (isFlexContainer(el)) {
      const alignment = append(content, "section", "am-smep-section");
      append(alignment, "div", "am-smep-heading").textContent = text("screenmockPanelAlignment", options);
      const renderAlignmentButtons = (
        property: "justify-content" | "align-items",
        labelKey: string,
        values: Array<{ value: string; labelKey: string }>,
      ): void => {
        const field = append(alignment, "div", "am-smep-field");
        append(field, "label").textContent = text(labelKey, options);
        const segment = append(field, "div", "am-smep-segment");
        const current = readStyleDeclaration(el.getAttribute("style"), property);
        for (const option of values) {
          const button = makeButton(text(option.labelKey, options));
          button.setAttribute("aria-pressed", String(current === option.value || (!current && !option.value)));
          button.addEventListener("click", () => applyAlignment(property, option.value));
          segment.appendChild(button);
        }
      };
      renderAlignmentButtons("justify-content", "screenmockPanelJustifyContent", JUSTIFY_OPTIONS);
      renderAlignmentButtons("align-items", "screenmockPanelAlignItems", ALIGN_OPTIONS);
    }

    renderActions(content);
  };

  const renderStructure = (): void => {
    const { source, screenIndex } = currentSelection();
    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    renderActions(content);
    const wrap = append(content, "section", "am-smep-section");
    append(wrap, "div", "am-smep-heading").textContent = text("screenmockPanelWrap", options);
    const wrapRow = append(wrap, "div", "am-smep-row-3");
    const rowButton = makeButton(text("screenmockPanelWrapRow", options));
    rowButton.addEventListener("click", () => wrapSelected("sm-row"));
    wrapRow.appendChild(rowButton);
    const colButton = makeButton(text("screenmockPanelWrapCol", options));
    colButton.addEventListener("click", () => wrapSelected("sm-col"));
    wrapRow.appendChild(colButton);
    const unwrapButton = makeButton(text("screenmockPanelUnwrap", options));
    unwrapButton.addEventListener("click", unwrapSelected);
    wrapRow.appendChild(unwrapButton);
    const section = append(content, "section", "am-smep-section");
    append(section, "div", "am-smep-heading").textContent = text("screenmockPanelStructureTree", options);
    const tree = append(section, "div", "am-smep-tree");
    const template = document.createElement("template");
    template.innerHTML = annotateScreenmockHtmlPaths(screenHtmlAt(source, screenIndex));
    let draggedPath: string | null = null;
    let dropButton: HTMLButtonElement | null = null;
    const markDropTarget = (button: HTMLButtonElement, path: string): void => {
      if (!draggedPath || draggedPath === path || path.startsWith(`${draggedPath}/`)) return;
      dropButton?.removeAttribute("aria-dropeffect");
      dropButton = button;
      button.setAttribute("aria-dropeffect", "move");
    };
    const clearDropTarget = (): void => {
      dropButton?.removeAttribute("aria-dropeffect");
      dropButton = null;
    };
    const renderNode = (el: Element, depth: number): void => {
      const path = el.getAttribute("data-sm-path");
      if (!path) return;
      const button = makeButton(classOrTag(el), "am-smep-tree-node");
      button.style.paddingLeft = `${8 + depth * 14}px`;
      button.setAttribute("aria-selected", String(path === selectedPath));
      button.draggable = designMode;
      button.addEventListener("click", () => {
        selectPath(path, false);
        options.setActiveScreenIndex?.(activeScreenIndex);
        render();
      });
      button.addEventListener("pointerdown", () => {
        draggedPath = path;
      });
      button.addEventListener("pointerover", () => markDropTarget(button, path));
      button.addEventListener("pointerup", (event) => {
        if (!draggedPath) return;
        event.preventDefault();
        const fromPath = draggedPath;
        draggedPath = null;
        clearDropTarget();
        moveSelectedTreeNode(fromPath, path);
      });
      button.addEventListener("dragstart", (event) => {
        draggedPath = path;
        event.dataTransfer?.setData("text/plain", path);
        event.dataTransfer?.setDragImage(button, 0, 0);
      });
      button.addEventListener("dragover", (event) => {
        if (!draggedPath || draggedPath === path || path.startsWith(`${draggedPath}/`)) return;
        event.preventDefault();
        markDropTarget(button, path);
      });
      button.addEventListener("dragleave", () => {
        if (dropButton === button) clearDropTarget();
      });
      button.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromPath = event.dataTransfer?.getData("text/plain") || draggedPath;
        draggedPath = null;
        clearDropTarget();
        if (fromPath) moveSelectedTreeNode(fromPath, path);
      });
      button.addEventListener("dragend", () => {
        draggedPath = null;
        clearDropTarget();
      });
      tree.appendChild(button);
      Array.from(el.children).forEach((child) => renderNode(child, depth + 1));
    };
    Array.from(template.content.children).forEach((child) => renderNode(child, 0));
    if (!tree.childElementCount) {
      append(section, "div", "am-smep-muted").textContent = text("screenmockPanelTreeEmpty", options);
    }
  };

  const renderScreens = (): void => {
    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    const source = options.getSource();
    const screens = parseScreenmock(source);
    const metadata = readScreenMetadata(source);
    const list = append(content, "div", "am-smep-screen-list");
    screens.forEach((screen, index) => {
      const meta = metadata[index] ?? {};
      const item = makeButton(meta.title || meta.id || `${text("screenmockPanelUntitledScreen", options)} ${index + 1}`, "am-smep-screen");
      item.setAttribute("aria-current", String(index === activeScreenIndex));
      item.addEventListener("click", () => switchScreen(index));
      list.appendChild(item);
    });
    if (!screens.length) {
      append(list, "div", "am-smep-muted").textContent = text("screenmockPanelNoScreens", options);
    }

    const actionRow = append(content, "div", "am-smep-row");
    const addButton = makeButton(text("screenmockPanelAddScreen", options));
    addButton.addEventListener("click", addScreen);
    actionRow.appendChild(addButton);
    const duplicateButton = makeButton(text("screenmockPanelDuplicate", options));
    duplicateButton.addEventListener("click", duplicateScreen);
    actionRow.appendChild(duplicateButton);
    const moveRow = append(content, "div", "am-smep-row");
    const upButton = makeButton(text("screenmockPanelMoveScreenUp", options));
    upButton.disabled = activeScreenIndex <= 0;
    upButton.addEventListener("click", () => moveActiveScreen(-1));
    moveRow.appendChild(upButton);
    const downButton = makeButton(text("screenmockPanelMoveScreenDown", options));
    downButton.disabled = activeScreenIndex >= screens.length - 1;
    downButton.addEventListener("click", () => moveActiveScreen(1));
    moveRow.appendChild(downButton);
    const deleteButton = makeButton(text("screenmockPanelDelete", options), "am-smep-action am-smep-action-danger");
    deleteButton.addEventListener("click", () => {
      void deleteScreen();
    });
    content.appendChild(deleteButton);

    const current = screens[activeScreenIndex];
    const currentMetadata = metadata[activeScreenIndex] ?? {};
    if (current) {
      const meta = append(content, "section", "am-smep-section");
      append(meta, "div", "am-smep-heading").textContent = text("screenmockPanelScreenMetadata", options);
      const idField = append(meta, "div", "am-smep-field");
      append(idField, "label").textContent = text("screenmockPanelScreenId", options);
      const idInput = append(idField, "input");
      idInput.value = currentMetadata.id ?? "";
      idInput.addEventListener("change", () => {
        void renameActiveScreenId(idInput.value.trim());
      });
      const titleField = append(meta, "div", "am-smep-field");
      append(titleField, "label").textContent = text("screenmockPanelScreenTitle", options);
      const titleInput = append(titleField, "input");
      titleInput.value = currentMetadata.title ?? "";
      titleInput.addEventListener("change", () => renameActiveScreenTitle(titleInput.value.trim()));
    }
  };

  function render(): void {
    designMode = options.getDesignMode();
    activeScreenIndex = normalizeActiveScreenIndex(options.getSource(), activeScreenIndex);
    if (selectedPath && !pathExists(options.getSource(), activeScreenIndex, selectedPath)) {
      selectedPath = null;
      activeTab = "parts";
    }
    bodyEl.replaceChildren();
    for (const [tab, button] of tabButtons) {
      button.setAttribute("aria-selected", String(tab === activeTab));
      button.tabIndex = tab === activeTab ? 0 : -1;
    }
    if (activeTab === "parts") renderParts();
    else if (activeTab === "attributes") renderAttributes();
    else if (activeTab === "structure") renderStructure();
    else renderScreens();
  }

  render();

  return {
    el: root,
    destroy: () => root.remove(),
    setDesignMode: (enabled) => {
      designMode = enabled;
      render();
    },
    setSelection: (path) => {
      selectedPath = path;
      if (activeTab !== "structure") activeTab = path ? "attributes" : "parts";
      render();
    },
    setActiveScreenIndex: (index) => {
      activeScreenIndex = normalizeActiveScreenIndex(options.getSource(), index);
      render();
    },
    render,
  };
}
