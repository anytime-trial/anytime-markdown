import DOMPurify from "dompurify";

export interface ScreenmockScreen {
  id: string;
  title: string;
  html: string;
}

export interface BuildScreenmockSrcdocOptions {
  initialScreenId?: string;
  emptyHint?: string;
  themeVars?: Record<string, string>;
}

export interface CreateScreenmockPreviewOptions extends BuildScreenmockSrcdocOptions {
  tabListLabel?: string;
}

const THEME_VAR_NAMES = [
  "--am-color-divider",
  "--am-color-text-primary",
  "--am-color-text-secondary",
  "--am-color-bg-paper",
  "--am-color-bg-default",
  "--am-color-primary-main",
  "--am-color-primary-contrast",
  "--am-color-action-hover",
  "--am-color-action-selected",
  "--am-color-error-main",
  "--am-color-success-main",
  "--am-color-warning-main",
];

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

function uniqueId(baseId: string, used: Map<string, number>): string {
  const base = baseId || `screen-${used.size + 1}`;
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  if (count === 0) return base;
  let n = count + 1;
  let candidate = `${base}-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  used.set(candidate, 1);
  return candidate;
}

function makeScreen(
  meta: { id?: string; title?: string },
  html: string,
  index: number,
  usedIds: Map<string, number>,
): ScreenmockScreen {
  const id = uniqueId(meta.id?.trim() || `screen-${index}`, usedIds);
  return {
    id,
    title: meta.title?.trim() || id,
    html: html.trim(),
  };
}

export function parseScreenmock(source: string): ScreenmockScreen[] {
  if (!source.trim()) return [];

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  const usedIds = new Map<string, number>();

  if (firstContentIndex < 0) return [];
  if (!isDelimiter(lines[firstContentIndex])) {
    return [makeScreen({}, source.trim(), 1, usedIds)];
  }

  const screens: ScreenmockScreen[] = [];
  let cursor = firstContentIndex;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    if (cursor >= lines.length) break;
    if (!isDelimiter(lines[cursor])) {
      const body = lines.slice(cursor).join("\n");
      screens.push(makeScreen({}, body, screens.length + 1, usedIds));
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
    const body = lines.slice(bodyStart, cursor).join("\n");
    const meta = parseFrontmatter(frontmatter);
    if (meta) {
      screens.push(makeScreen(meta, body, screens.length + 1, usedIds));
    }
  }

  return screens;
}

export function sanitizeScreenmockHtml(html: string): string {
  const sourceTemplate = document.createElement("template");
  sourceTemplate.innerHTML = html;
  const styleTags = Array.from(sourceTemplate.content.querySelectorAll("style")).map((style) => style.textContent ?? "");
  sourceTemplate.content.querySelectorAll("style").forEach((style) => style.remove());

  // style タグはサニタイズ前に抽出・除去済み（下で </style を無害化して再付与）なので、
  // DOMPurify に style を許可する必要はない（S8479: ADD_TAGS に style を残さない）。
  const sanitized = DOMPurify.sanitize(sourceTemplate.innerHTML, {
    ADD_ATTR: ["class", "style"],
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["action"],
    ALLOW_DATA_ATTR: true,
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;
  template.content.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("#")) anchor.removeAttribute("href");
  });
  template.content.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("https:") && !src.startsWith("data:")) img.removeAttribute("src");
  });
  // srcset は候補 URL ごとの検査が要り src 制限（https:/data: のみ）の迂回路になるため属性ごと落とす
  template.content.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
  });
  template.content.querySelectorAll("form[action]").forEach((form) => {
    form.removeAttribute("action");
  });
  const styles = styleTags.map((css) => `<style>${css.replaceAll("</style", "<\\/style")}</style>`).join("");
  return `${styles}${template.innerHTML}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replaceAll(/[^A-Za-z0-9_-]/g, "\\$&");
}

function buildRootStyle(themeVars: Record<string, string> | undefined): string {
  if (!themeVars) return "";
  return Object.entries(themeVars)
    .filter(([key, value]) => key.startsWith("--am-color-") && value.trim())
    .map(([key, value]) => `${key}:${value.replaceAll(/[;{}]/g, "")};`)
    .join("");
}

export function collectScreenmockThemeVars(host: Element | null): Record<string, string> {
  if (!host || typeof getComputedStyle === "undefined") return {};
  const style = getComputedStyle(host);
  const vars: Record<string, string> = {};
  for (const name of THEME_VAR_NAMES) {
    const value = style.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  return vars;
}

export const SCREENMOCK_VARS = `
  --sm-gap:12px;
  --sm-radius:8px;
  --sm-border:1px solid var(--am-color-divider,#d0d7de);
  --sm-text:var(--am-color-text-primary,#1f2328);
  --sm-muted:var(--am-color-text-secondary,#656d76);
  --sm-paper:var(--am-color-bg-paper,#fff);
  --sm-bg:var(--am-color-bg-default,#f6f8fa);
  --sm-primary:var(--am-color-primary-main,#0969da);
  --sm-on-primary:var(--am-color-primary-contrast,#fff);
  color-scheme:light dark;
`;

export const SCREENMOCK_STYLE = `
:root{${SCREENMOCK_VARS}}
*{box-sizing:border-box;}
html,body{margin:0;min-height:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--sm-text);background:var(--sm-bg);}
body{padding:var(--sm-gap);}
.am-sm-wrap{display:none;min-height:320px;background:var(--sm-paper);border:var(--sm-border);border-radius:var(--sm-radius);overflow:hidden;}
.am-sm-wrap:target{display:block;}
.am-sm-wrap .sm-screen{border:0;border-radius:0;}
.sm-header,.sm-footer{padding:12px 16px;border-color:var(--am-color-divider,#d0d7de);background:color-mix(in srgb,var(--sm-bg) 72%,var(--sm-paper));}
.sm-header{border-bottom:var(--sm-border);font-weight:600;}
.sm-footer{border-top:var(--sm-border);color:var(--sm-muted);font-size:0.875rem;}
.sm-sidebar{width:220px;padding:var(--sm-gap);border-right:var(--sm-border);background:var(--sm-bg);}
.sm-sidebar-right{border-right:0;border-left:var(--sm-border);order:2;}
.sm-main{flex:1;padding:16px;min-width:0;}
.sm-row{display:flex;gap:var(--sm-gap);align-items:stretch;}
.sm-col{display:flex;flex-direction:column;gap:var(--sm-gap);}
.sm-card{border:var(--sm-border);border-radius:var(--sm-radius);background:var(--sm-paper);padding:var(--sm-gap);}
.sm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 12px;border:var(--sm-border);border-radius:6px;color:var(--sm-text);background:var(--sm-paper);text-decoration:none;font-weight:600;}
.sm-btn-primary{border-color:var(--sm-primary);background:var(--sm-primary);color:var(--sm-on-primary);}
.sm-input{display:block;width:100%;min-height:34px;padding:6px 10px;border:var(--sm-border);border-radius:6px;color:var(--sm-text);background:var(--sm-paper);}
.sm-table{width:100%;border-collapse:collapse;background:var(--sm-paper);}
.sm-table th,.sm-table td{border:var(--sm-border);padding:8px 10px;text-align:left;}
.sm-list{margin:0;padding-left:20px;}
.sm-badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;background:var(--am-color-action-selected,rgba(9,105,218,.12));color:var(--sm-primary);font-size:0.75rem;font-weight:600;}
.sm-heading{font-weight:700;font-size:1.125rem;margin:0 0 8px;}
.sm-text{display:block;height:10px;max-width:100%;border-radius:999px;background:var(--am-color-action-hover,rgba(0,0,0,.08));box-shadow:0 18px 0 var(--am-color-action-hover,rgba(0,0,0,.08)),0 36px 0 var(--am-color-action-hover,rgba(0,0,0,.08));}
.sm-text[data-lines="1"]{box-shadow:none;}
.sm-text[data-lines="2"]{box-shadow:0 18px 0 var(--am-color-action-hover,rgba(0,0,0,.08));}
.sm-img{display:block;min-height:120px;border:var(--sm-border);border-radius:var(--sm-radius);background:linear-gradient(135deg,transparent calc(50% - 1px),var(--am-color-divider,#d0d7de) 50%,transparent calc(50% + 1px)),linear-gradient(45deg,transparent calc(50% - 1px),var(--am-color-divider,#d0d7de) 50%,transparent calc(50% + 1px)),var(--sm-bg);}
.sm-empty{min-height:320px;display:flex;align-items:center;justify-content:center;padding:24px;border:1px dashed var(--am-color-divider,#d0d7de);border-radius:var(--sm-radius);color:var(--sm-muted);background:var(--sm-paper);white-space:pre-wrap;text-align:center;}
`;

export function buildScreenmockSrcdoc(
  screens: ScreenmockScreen[],
  options: BuildScreenmockSrcdocOptions = {},
): string {
  const rootStyle = buildRootStyle(options.themeVars);
  const initialId = options.initialScreenId && screens.some((screen) => screen.id === options.initialScreenId)
    ? options.initialScreenId
    : screens[0]?.id;
  const initialSelector = initialId
    ? `body:not(:has(.am-sm-wrap:target)) #${escapeCssIdentifier(initialId)}{display:block;}`
    : "";
  const body = screens.length
    ? screens
        .map((screen) => `<section class="am-sm-wrap" id="${escapeHtml(screen.id)}">${sanitizeScreenmockHtml(screen.html)}</section>`)
        .join("\n")
    : `<div class="sm-empty">${escapeHtml(options.emptyHint ?? "Add screenmock HTML here.")}</div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${SCREENMOCK_STYLE}
${initialSelector}</style>
</head>
<body>
${rootStyle ? `<style>:root{${rootStyle}}</style>` : ""}
${body}
</body>
</html>`;
}

function setActiveTab(tabs: HTMLButtonElement[], activeId: string): void {
  for (const tab of tabs) {
    const selected = tab.dataset.screenId === activeId;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.style.background = selected ? "var(--am-color-action-selected, rgba(9,105,218,.12))" : "transparent";
    tab.style.color = selected ? "var(--am-color-primary-main, #0969da)" : "var(--am-color-text-secondary, #656d76)";
  }
}

export function createScreenmockPreview(
  source: string,
  options: CreateScreenmockPreviewOptions = {},
): HTMLElement {
  const screens = parseScreenmock(source);
  const root = document.createElement("div");
  root.className = "am-screenmock-preview";
  root.style.cssText =
    "display:flex;flex-direction:column;gap:6px;width:100%;max-width:100%;color:var(--am-color-text-primary);";

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "");
  iframe.title = "screenmock preview";
  iframe.style.cssText =
    "display:block;width:100%;height:360px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;background:var(--am-color-bg-paper,#fff);";

  let activeId = screens[0]?.id;
  const tabs: HTMLButtonElement[] = [];
  const render = (): void => {
    iframe.srcdoc = buildScreenmockSrcdoc(screens, {
      ...options,
      initialScreenId: activeId,
      themeVars: options.themeVars ?? collectScreenmockThemeVars(root),
    });
    if (activeId) setActiveTab(tabs, activeId);
  };

  if (screens.length > 1) {
    const tabBar = document.createElement("div");
    tabBar.setAttribute("role", "tablist");
    tabBar.setAttribute("aria-label", options.tabListLabel ?? "Screens");
    tabBar.style.cssText = "display:flex;gap:4px;overflow:auto;padding:2px 0;";
    for (const screen of screens) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.dataset.screenId = screen.id;
      tab.setAttribute("role", "tab");
      tab.textContent = screen.title;
      tab.style.cssText =
        "flex:0 0 auto;min-height:28px;padding:3px 10px;border:1px solid var(--am-color-divider,#d0d7de);border-radius:6px;cursor:pointer;font:inherit;";
      tab.addEventListener("click", () => {
        activeId = screen.id;
        render();
      });
      tabs.push(tab);
      tabBar.appendChild(tab);
    }
    root.appendChild(tabBar);
  }

  root.appendChild(iframe);
  render();
  scheduleConnectedRerender(root, render);
  return root;
}

/**
 * 切断状態の要素への getComputedStyle は祖先由来の --am-color-* を解決できず、
 * 初回 render のテーマ変数が空になる。DOM 接続を待って一度だけ再描画する。
 */
export function scheduleConnectedRerender(root: HTMLElement, render: () => void): void {
  const schedule =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb: FrameRequestCallback): number => globalThis.setTimeout(() => cb(0), 0) as unknown as number;
  let attempts = 0;
  const tick = (): void => {
    if (root.isConnected) {
      render();
      return;
    }
    attempts += 1;
    if (attempts < 30) schedule(tick);
  };
  schedule(tick);
}
