/**
 * screenmock デザイン編集モードの「画面 HTML への変異」を担う純粋関数群。
 *
 * 正本はフェンス内テキストであり、GUI 操作は必ず「元ソースをパース → DOM を変異 →
 * 直列化」の経路を通す。DOM API は使うが副作用は持たず、入力文字列から出力文字列が
 * 決まる（描画・イベントには依存しない）ため単体でテストできる。
 */

export interface ScreenmockElementSize {
  widthPercent: number;
  heightPx: number;
}

function elementPathOf(path: string): number[] | null {
  if (!path) return null;
  const parts = path.split("/").map((part) => Number(part));
  return parts.every((part) => Number.isInteger(part) && part >= 0) ? parts : null;
}

/** パス（"0/1/2" 形式の子インデックス連鎖）で要素を引く。 */
export function findElementByPath(root: DocumentFragment | Element, path: string): Element | null {
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

/**
 * 挿入位置を「移動元を取り除いたあとの並び」における添字へ読み替える。
 * toIndex は移動元を取り除く前のコンテナにおける位置で受け取る契約のため、
 * 同一コンテナ内で後方へ動かすときだけ 1 つ手前へずれる。
 */
function resolveInsertIndex(toIndex: number, children: Element[], target: Element): number {
  const currentIndex = children.indexOf(target);
  const removedBefore = currentIndex >= 0 && currentIndex < toIndex ? 1 : 0;
  return Math.max(0, toIndex - removedBefore);
}

/**
 * 画面 HTML 内の要素を別の位置へ移動する（並べ替え）。
 *
 * `toParentPath` が空文字のときは画面直下（フラグメント直下）を指す。移動先が移動元自身
 * またはその子孫の場合、いずれかのパスが解決できない場合は入力をそのまま返す（不正操作で
 * 画面を壊さない）。
 */
export function moveScreenmockElement(
  screenHtml: string,
  fromPath: string,
  toParentPath: string,
  toIndex: number,
): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  const target = findElementByPath(template.content, fromPath);
  const parent: DocumentFragment | Element | null =
    toParentPath === "" ? template.content : findElementByPath(template.content, toParentPath);
  if (!target || !parent) return screenHtml;
  if (target === parent || target.contains(parent)) return screenHtml;

  const children = Array.from(parent.children);
  const remaining = children.filter((child) => child !== target);
  const before = remaining[resolveInsertIndex(toIndex, children, target)] ?? null;
  parent.insertBefore(target, before);
  removePathAttributes(template.content);
  return template.innerHTML;
}

export interface ScreenmockElementPosition {
  leftPx: number;
  topPx: number;
}

function hasPositionDeclaration(style: string | null): boolean {
  return (style ?? "")
    .split(";")
    .some((part) => part.trim().toLowerCase().startsWith("position:"));
}

/**
 * 対象要素を親要素基準の座標で固定する（自由配置）。
 *
 * 親が静的配置のままだと left/top の基準がさらに外側の祖先になるため、親へ
 * `position: relative` を補う（既に配置指定があるなら触らない）。
 */
export function applyElementAbsolutePosition(
  screenHtml: string,
  path: string,
  position: ScreenmockElementPosition,
): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  const target = findElementByPath(template.content, path);
  if (!target) return screenHtml;

  target.setAttribute(
    "style",
    mergeStyleAttribute(target.getAttribute("style"), {
      position: "absolute",
      left: `${Math.round(position.leftPx)}px`,
      top: `${Math.round(position.topPx)}px`,
    }),
  );

  const parent = target.parentElement;
  if (parent && !hasPositionDeclaration(parent.getAttribute("style"))) {
    parent.setAttribute("style", mergeStyleAttribute(parent.getAttribute("style"), { position: "relative" }));
  }

  removePathAttributes(template.content);
  return template.innerHTML;
}
