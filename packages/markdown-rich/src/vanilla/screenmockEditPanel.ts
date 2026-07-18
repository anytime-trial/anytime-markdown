import { getDivider, getTextDisabled, getTextSecondary } from "@anytime-markdown/markdown-viewer";
import { ensureStyle } from "./dialogHelpers";
import { parseScreenmock } from "./screenmockPreview";
import {
  applyElementSizeToScreenHtml,
  duplicateScreenmockElement,
  findElementByPath,
  insertScreenmockElement,
  parseScreenRanges,
  removeScreenmockElement,
  removeScreenmockElementHeight,
  removeScreenmockElementWidth,
  replaceScreenmockScreenHtml,
  setScreenmockElementHref,
  setScreenmockElementText,
} from "./screenmockHtmlMutations";

export interface CreateScreenmockEditPanelOptions {
  getSource: () => string;
  setSource: (source: string) => void;
  t: (key: string) => string;
  getDesignMode: () => boolean;
  getSelectedPath: () => string | null;
  setSelectedPath: (path: string | null) => void;
  getActiveScreenIndex: () => number;
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
.am-smep-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.am-smep-muted{color:var(--am-color-text-secondary,#656d76);font-size:12px;}
.am-smep-chip{display:inline-flex;width:max-content;max-width:100%;padding:2px 7px;border-radius:999px;background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--am-color-primary-main,#0969da);font-size:12px;font-weight:600;}
.am-smep-screen-list{display:flex;flex-direction:column;gap:6px;}
.am-smep-screen{padding:6px 8px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-action-hover,rgba(0,0,0,.04));}
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

  const setSourceAndRender = (source: string): void => {
    options.setSource(source);
    render();
  };

  const currentSelection = (): { source: string; screenIndex: number; path: string | null; el: HTMLElement | null } => {
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const path = pathExists(source, screenIndex, selectedPath) ? selectedPath : null;
    return { source, screenIndex, path, el: readElement(source, screenIndex, path) };
  };

  const selectPath = (path: string | null): void => {
    selectedPath = path;
    options.setSelectedPath(path);
    activeTab = path ? "attributes" : "parts";
  };

  const insertPart = (part: PartItem): void => {
    if (!designMode) return;
    const source = options.getSource();
    const screenIndex = normalizeActiveScreenIndex(source, activeScreenIndex);
    const containerPath = pathExists(source, screenIndex, selectedPath) ? selectedPath ?? "" : "";
    const index = childCount(source, screenIndex, containerPath);
    const next = insertScreenmockElement(source, screenIndex, containerPath, part.html);
    const newPath = containerPath ? `${containerPath}/${index}` : String(index);
    selectPath(newPath);
    setSourceAndRender(next);
  };

  const applySize = (property: "width" | "height", value: string): void => {
    const { source, screenIndex, path, el } = currentSelection();
    if (!path || !el || !designMode) return;
    if (!value.trim()) {
      const next = property === "width"
        ? removeScreenmockElementWidth(source, screenIndex, path)
        : removeScreenmockElementHeight(source, screenIndex, path);
      setSourceAndRender(next);
      return;
    }
    const widthRaw =
      property === "width" ? Number.parseFloat(value) : Number.parseFloat(readStyleDeclaration(el.getAttribute("style"), "width"));
    const heightRaw =
      property === "height" ? Number.parseFloat(value) : Number.parseFloat(readStyleDeclaration(el.getAttribute("style"), "height"));
    const widthPercent = Number.isFinite(widthRaw) ? widthRaw : 100;
    const heightPx = Number.isFinite(heightRaw) ? heightRaw : Math.max(el.getBoundingClientRect().height || 0, 1);
    const screenHtml = screenHtmlAt(source, screenIndex);
    const nextHtml = applyElementSizeToScreenHtml(screenHtml, path, { widthPercent, heightPx });
    setSourceAndRender(replaceScreenmockScreenHtml(source, screenIndex, nextHtml));
  };

  const applyText = (value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    setSourceAndRender(setScreenmockElementText(source, screenIndex, path, value));
  };

  const applyHref = (value: string): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    setSourceAndRender(setScreenmockElementHref(source, screenIndex, path, value || null));
  };

  const removeSelected = (): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    selectPath(null);
    setSourceAndRender(removeScreenmockElement(source, screenIndex, path));
  };

  const duplicateSelected = (): void => {
    const { source, screenIndex, path } = currentSelection();
    if (!path || !designMode) return;
    const result = duplicateScreenmockElement(source, screenIndex, path);
    selectPath(result.newPath);
    setSourceAndRender(result.source);
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
        grid.appendChild(button);
      }
    };
    addGroup(text("screenmockPanelCategoryLayout", options), LAYOUT_PARTS);
    addGroup(text("screenmockPanelCategoryComponents", options), COMPONENT_PARTS);
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

    renderActions(content);
  };

  const renderStructure = (): void => {
    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    renderActions(content);
    const placeholder = append(content, "div", "am-smep-disabled-note");
    placeholder.textContent = text("screenmockPanelTreePlaceholder", options);
  };

  const renderScreens = (): void => {
    const content = append(bodyEl, "div", designMode ? "" : "am-smep-disabled");
    const list = append(content, "div", "am-smep-screen-list");
    for (const screen of parseScreenmock(options.getSource())) {
      const item = append(list, "div", "am-smep-screen");
      item.textContent = `${screen.id} ${screen.title}`;
    }
    const placeholder = append(content, "div", "am-smep-disabled-note");
    placeholder.textContent = text("screenmockPanelScreensPlaceholder", options);
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
      activeTab = path ? "attributes" : "parts";
      render();
    },
    setActiveScreenIndex: (index) => {
      activeScreenIndex = normalizeActiveScreenIndex(options.getSource(), index);
      render();
    },
    render,
  };
}
