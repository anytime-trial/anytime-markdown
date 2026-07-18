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

interface ScreenBlock extends ScreenRange {
  blockStart: number;
  blockEnd: number;
  frontmatterStart: number | null;
  frontmatterEnd: number | null;
  frontmatter: string[];
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

export function parseScreenRanges(source: string): ScreenRange[] {
  return parseScreenBlocks(source).map(({ bodyStart, bodyEnd }) => ({ bodyStart, bodyEnd }));
}

function parseScreenBlocks(source: string): ScreenBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex < 0) return [];
  if (!isDelimiter(lines[firstContentIndex])) {
    return [
      {
        blockStart: 0,
        blockEnd: lines.length,
        frontmatterStart: null,
        frontmatterEnd: null,
        frontmatter: [],
        bodyStart: 0,
        bodyEnd: lines.length,
      },
    ];
  }

  const ranges: ScreenBlock[] = [];
  let cursor = firstContentIndex;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
    if (cursor >= lines.length) break;
    if (!isDelimiter(lines[cursor])) {
      ranges.push({
        blockStart: cursor,
        blockEnd: lines.length,
        frontmatterStart: null,
        frontmatterEnd: null,
        frontmatter: [],
        bodyStart: cursor,
        bodyEnd: lines.length,
      });
      break;
    }
    const blockStart = cursor;
    cursor += 1;
    const fmStart = cursor;
    while (cursor < lines.length && !isDelimiter(lines[cursor])) cursor += 1;
    if (cursor >= lines.length) break;
    const frontmatter = lines.slice(fmStart, cursor);
    cursor += 1;
    const bodyStart = cursor;
    while (cursor < lines.length && !isDelimiter(lines[cursor])) cursor += 1;
    if (parseFrontmatter(frontmatter)) {
      ranges.push({
        blockStart,
        blockEnd: cursor,
        frontmatterStart: fmStart,
        frontmatterEnd: fmStart + frontmatter.length,
        frontmatter,
        bodyStart,
        bodyEnd: cursor,
      });
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

function readScreenmockScreenHtml(source: string, screenIndex: number): string | null {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const range = parseScreenRanges(normalized)[screenIndex];
  if (!range) return null;
  return lines.slice(range.bodyStart, range.bodyEnd).join("\n");
}

function mutateScreenmockScreenHtml(
  source: string,
  screenIndex: number,
  mutate: (template: HTMLTemplateElement) => boolean,
): string {
  const screenHtml = readScreenmockScreenHtml(source, screenIndex);
  if (screenHtml === null) return source.replace(/\r\n?/g, "\n");
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  if (!mutate(template)) return source.replace(/\r\n?/g, "\n");
  removePathAttributes(template.content);
  return replaceScreenmockScreenHtml(source, screenIndex, template.innerHTML);
}

function firstElementFromHtml(html: string): Element | null {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function childIndentFor(parent: DocumentFragment | Element, before: Node | null): string | null {
  const destination = before?.previousSibling;
  if (isWhitespaceText(destination)) return destination.data;
  const firstChild = parent.firstElementChild;
  const firstIndent = firstChild?.previousSibling;
  if (isWhitespaceText(firstIndent)) return firstIndent.data;
  const closingIndent = parent.lastChild;
  if (isWhitespaceText(closingIndent) && closingIndent.data.includes("\n")) {
    const match = /\n([ \t]*)$/.exec(closingIndent.data);
    if (match) return `\n${match[1]}  `;
  }
  return null;
}

function insertElementNode(parent: DocumentFragment | Element, element: Element, index?: number): string | null {
  const children = Array.from(parent.children);
  const insertIndex = index === undefined ? children.length : Math.max(0, Math.min(index, children.length));
  let before: Node | null = children[insertIndex] ?? null;
  if (!before && isWhitespaceText(parent.lastChild)) before = parent.lastChild;

  const indent = childIndentFor(parent, before);
  if (isWhitespaceText(before)) {
    if (indent !== null) parent.insertBefore(parent.ownerDocument.createTextNode(indent), before);
    parent.insertBefore(element, before);
  } else {
    parent.insertBefore(element, before);
    if (indent !== null) parent.insertBefore(parent.ownerDocument.createTextNode(indent), before);
  }

  const parentPath = element.parentElement ? pathOfElement(element.parentElement) : "";
  const newIndex = Array.from(parent.children).indexOf(element);
  return parentPath ? `${parentPath}/${newIndex}` : String(newIndex);
}

function pathOfElement(element: Element): string {
  const parts: number[] = [];
  let current: Element | null = element;
  while (current.parentElement) {
    parts.unshift(Array.from(current.parentElement.children).indexOf(current));
    current = current.parentElement;
  }
  const rootParent = current.parentNode;
  if (current && rootParent instanceof DocumentFragment) {
    parts.unshift(Array.from(rootParent.children).indexOf(current));
  }
  return parts.join("/");
}

export function insertScreenmockElement(
  source: string,
  screenIndex: number,
  containerPath: string,
  html: string,
  index?: number,
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const parent =
      containerPath === "" ? template.content : findElementByPath(template.content, containerPath);
    const element = firstElementFromHtml(html);
    if (!parent || !element) return false;
    insertElementNode(parent, element, index);
    return true;
  });
}

function elementsFromHtml(html: string): Element[] {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return Array.from(template.content.children);
}

export function insertScreenmockFragment(
  source: string,
  screenIndex: number,
  containerPath: string,
  html: string,
  index?: number,
): InsertScreenmockFragmentResult {
  const newPaths: string[] = [];
  const nextSource = mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const parent =
      containerPath === "" ? template.content : findElementByPath(template.content, containerPath);
    const elements = elementsFromHtml(html);
    if (!parent || elements.length === 0) return false;
    const insertIndex =
      index === undefined ? undefined : Math.max(0, Math.min(index, Array.from(parent.children).length));
    elements.forEach((element, offset) => {
      const nextIndex = insertIndex === undefined ? undefined : insertIndex + offset;
      const newPath = insertElementNode(parent, element, nextIndex);
      if (newPath !== null) newPaths.push(newPath);
    });
    return newPaths.length > 0;
  });
  return { source: nextSource, newPaths };
}

export function removeScreenmockElement(source: string, screenIndex: number, path: string): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    const leadingWhitespace = target.previousSibling;
    if (isWhitespaceText(leadingWhitespace)) leadingWhitespace.remove();
    target.remove();
    return true;
  });
}

export interface DuplicateScreenmockElementResult {
  source: string;
  newPath: string | null;
}

export interface WrapScreenmockElementResult {
  source: string;
  newPath: string | null;
}

export interface InsertScreenmockFragmentResult {
  source: string;
  newPaths: string[];
}

export function duplicateScreenmockElement(
  source: string,
  screenIndex: number,
  path: string,
): DuplicateScreenmockElementResult {
  let newPath: string | null = null;
  const nextSource = mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    // sm-screen ラッパを持たないモックではトップレベル要素の親がフラグメントになるため、
    // parentElement（Element 限定）ではなく親ノードを Element | DocumentFragment で受ける。
    const parentNode = target?.parentNode ?? null;
    const parent =
      parentNode instanceof Element || parentNode instanceof DocumentFragment ? parentNode : null;
    if (!target || !parent) return false;
    const clone = target.cloneNode(true) as Element;
    const index = Array.from(parent.children).indexOf(target) + 1;
    newPath = insertElementNode(parent, clone, index);
    return true;
  });
  return { source: nextSource, newPath };
}

function parentContainerOf(target: Element): DocumentFragment | Element | null {
  const parentNode = target.parentNode;
  return parentNode instanceof Element || parentNode instanceof DocumentFragment ? parentNode : null;
}

function whitespaceIndentPart(whitespace: string): string {
  const match = /\n([ \t]*)$/.exec(whitespace);
  return match ? match[1] : "";
}

function previousIndentOf(target: Element): string | null {
  const leadingWhitespace = target.previousSibling;
  return isWhitespaceText(leadingWhitespace) ? leadingWhitespace.data : null;
}

function normalizeElementLeadingWhitespace(element: Element, indent: string | null): void {
  if (indent === null) return;
  const document = element.ownerDocument;
  const childIndent = `\n${whitespaceIndentPart(indent)}  `;
  const closingIndent = indent;
  if (element.firstChild) element.insertBefore(document.createTextNode(childIndent), element.firstChild);
  else element.appendChild(document.createTextNode(childIndent));
  element.appendChild(document.createTextNode(closingIndent));
}

function isScreenmockScreenElement(element: Element): boolean {
  return (element.getAttribute("class") ?? "").split(/\s+/).includes("sm-screen");
}

export function wrapScreenmockElement(
  source: string,
  screenIndex: number,
  path: string,
  wrapperClassName: string,
): WrapScreenmockElementResult {
  let newPath: string | null = null;
  if (wrapperClassName !== "sm-row" && wrapperClassName !== "sm-col") {
    return { source: source.replace(/\r\n?/g, "\n"), newPath };
  }
  const nextSource = mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target || isScreenmockScreenElement(target)) return false;
    const parent = parentContainerOf(target);
    if (!parent) return false;

    const wrapper = template.ownerDocument.createElement("div");
    wrapper.setAttribute("class", wrapperClassName);
    const indent = previousIndentOf(target);
    parent.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    normalizeElementLeadingWhitespace(wrapper, indent);
    newPath = `${pathOfElement(wrapper)}/0`;
    return true;
  });
  return { source: nextSource, newPath };
}

function childIndentForUnwrap(target: Element, parent: DocumentFragment | Element): string | null {
  const targetIndent = previousIndentOf(target);
  if (targetIndent !== null) return targetIndent;
  return childIndentFor(parent, target);
}

function removeLeadingWhitespace(node: Node): void {
  const leadingWhitespace = node.previousSibling;
  if (isWhitespaceText(leadingWhitespace)) leadingWhitespace.remove();
}

export function unwrapScreenmockElement(source: string, screenIndex: number, path: string): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    const parent = parentContainerOf(target);
    if (!parent) return false;
    const indent = childIndentForUnwrap(target, parent);
    const children = Array.from(target.children);

    removeLeadingWhitespace(target);
    for (const child of children) {
      removeLeadingWhitespace(child);
      if (indent !== null) parent.insertBefore(template.ownerDocument.createTextNode(indent), target);
      parent.insertBefore(child, target);
    }
    target.remove();
    return true;
  });
}

function isVoidTextElement(element: Element): boolean {
  return ["input", "textarea"].includes(element.tagName.toLowerCase());
}

export function setScreenmockElementText(
  source: string,
  screenIndex: number,
  path: string,
  text: string,
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    if (isVoidTextElement(target)) {
      target.setAttribute("placeholder", text);
      return true;
    }
    Array.from(target.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove());
    target.insertBefore(template.ownerDocument.createTextNode(text), target.firstChild);
    return true;
  });
}

function isValidSrcAttributeValue(value: string): boolean {
  return value.startsWith("data:") || value.startsWith("https:");
}

function isPositiveIntegerString(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

export function setScreenmockElementAttribute(
  source: string,
  screenIndex: number,
  path: string,
  name: string,
  value: string | null,
): string {
  if (name !== "data-lines" && name !== "src") return source.replace(/\r\n?/g, "\n");
  if (value !== null) {
    if (name === "data-lines" && !isPositiveIntegerString(value)) return source.replace(/\r\n?/g, "\n");
    if (name === "src" && !isValidSrcAttributeValue(value)) return source.replace(/\r\n?/g, "\n");
  }
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    if (value === null) target.removeAttribute(name);
    else target.setAttribute(name, value);
    return true;
  });
}

function isValidScreenId(screenId: string): boolean {
  return screenId.length > 0 && !screenId.includes("#");
}

export function setScreenmockElementHref(
  source: string,
  screenIndex: number,
  path: string,
  screenId: string | null,
): string {
  if (screenId !== null && !isValidScreenId(screenId)) return source.replace(/\r\n?/g, "\n");
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target || target.tagName.toLowerCase() !== "a") return false;
    if (screenId === null) target.removeAttribute("href");
    else target.setAttribute("href", `#${screenId}`);
    return true;
  });
}

function removeScreenmockElementDeclarations(
  source: string,
  screenIndex: number,
  path: string,
  names: string[],
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    setStyleAttribute(target, removeDeclarations(target.getAttribute("style"), names));
    return true;
  });
}

export function removeScreenmockElementWidth(source: string, screenIndex: number, path: string): string {
  return removeScreenmockElementDeclarations(source, screenIndex, path, ["width"]);
}

export function removeScreenmockElementHeight(source: string, screenIndex: number, path: string): string {
  return removeScreenmockElementDeclarations(source, screenIndex, path, ["height"]);
}

export function toggleScreenmockElementClass(
  source: string,
  screenIndex: number,
  path: string,
  className: string,
  enabled: boolean,
): string {
  const normalizedClassName = className.trim();
  if (!normalizedClassName || /\s/.test(normalizedClassName)) return source.replace(/\r\n?/g, "\n");
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    const classes = (target.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const existing = classes.includes(normalizedClassName);
    if (enabled && existing) return false;
    if (!enabled && !existing) return false;
    const nextClasses = enabled
      ? [...classes, normalizedClassName]
      : classes.filter((value) => value !== normalizedClassName);
    if (nextClasses.length) target.setAttribute("class", nextClasses.join(" "));
    else target.removeAttribute("class");
    return true;
  });
}

export function setScreenmockElementStyleDeclaration(
  source: string,
  screenIndex: number,
  path: string,
  name: string,
  value: string | null,
): string {
  const normalizedName = name.trim();
  if (!normalizedName) return source.replace(/\r\n?/g, "\n");
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    if (value === null) {
      setStyleAttribute(target, removeDeclarations(target.getAttribute("style"), [normalizedName.toLowerCase()]));
    } else {
      target.setAttribute(
        "style",
        mergeStyleAttribute(target.getAttribute("style"), { [normalizedName]: value.trim() }),
      );
    }
    return true;
  });
}

export interface ScreenmockElementAbsoluteOffset {
  leftPx?: number;
  topPx?: number;
}

export function setScreenmockElementOffset(
  source: string,
  screenIndex: number,
  path: string,
  offset: ScreenmockElementAbsoluteOffset,
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;

    let style = target.getAttribute("style");
    const next: Record<string, string> = {};
    const hasLeft = Object.prototype.hasOwnProperty.call(offset, "leftPx");
    const hasTop = Object.prototype.hasOwnProperty.call(offset, "topPx");
    if (!hasLeft && !hasTop) return false;

    if (hasLeft) {
      const left = Math.round(offset.leftPx ?? 0);
      if (left === 0) style = removeDeclarations(style, ["left"]);
      else next.left = `${left}px`;
    }
    if (hasTop) {
      const top = Math.round(offset.topPx ?? 0);
      if (top === 0) style = removeDeclarations(style, ["top"]);
      else next.top = `${top}px`;
    }

    if (Object.keys(next).length > 0) {
      const declared = readDeclaration(style, "position");
      const position = !declared || declared.toLowerCase() === "static" ? "relative" : declared;
      style = mergeStyleAttribute(style, { position, ...next });
    }

    const hasLeftDeclaration = readDeclaration(style, "left") !== null;
    const hasTopDeclaration = readDeclaration(style, "top") !== null;
    if (!hasLeftDeclaration && !hasTopDeclaration) {
      // 取り除くのは自動付与された relative だけ。ユーザー指定の absolute 等や
      // right / bottom 基準の配置は尊重する（仕様 §4.1.2）。
      const position = readDeclaration(style, "position");
      const anchored =
        readDeclaration(style, "right") !== null || readDeclaration(style, "bottom") !== null;
      if (position !== null && position.toLowerCase() === "relative" && !anchored) {
        style = removeDeclarations(style, ["position"]);
      }
    }
    setStyleAttribute(target, style ?? "");
    return true;
  });
}

/**
 * 幅だけを書き戻す（% 小数 1 桁）。パネルの数値入力は片側ずつの独立編集のため、
 * 両値契約の {@link applyElementSizeToScreenHtml}（リサイズハンドル用）とは分ける。
 */
export function setScreenmockElementWidth(
  source: string,
  screenIndex: number,
  path: string,
  widthPercent: number,
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    target.setAttribute(
      "style",
      mergeStyleAttribute(target.getAttribute("style"), { width: `${widthPercent.toFixed(1)}%` }),
    );
    return true;
  });
}

/** 高さだけを書き戻す（px 整数）。分離の理由は {@link setScreenmockElementWidth} と同じ。 */
export function setScreenmockElementHeight(
  source: string,
  screenIndex: number,
  path: string,
  heightPx: number,
): string {
  return mutateScreenmockScreenHtml(source, screenIndex, (template) => {
    const target = findElementByPath(template.content, path);
    if (!target) return false;
    target.setAttribute(
      "style",
      mergeStyleAttribute(target.getAttribute("style"), { height: `${Math.round(heightPx)}px` }),
    );
    return true;
  });
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
  let before: Node | null = remaining[resolveInsertIndex(toIndex, children, target)] ?? null;
  // 末尾へ入れるときは閉じタグ手前の空白（インデント）より前に置く。
  if (!before && isWhitespaceText(parent.lastChild)) before = parent.lastChild;

  const indent = indentTextFor(target, before);
  const leadingWhitespace = target.previousSibling;
  if (isWhitespaceText(leadingWhitespace)) leadingWhitespace.remove();

  parent.insertBefore(target, before);
  // 移動先でも要素が行頭に来るよう、直後へ元と同じインデントを補う。
  if (indent !== null) parent.insertBefore(template.ownerDocument.createTextNode(indent), before);

  removePathAttributes(template.content);
  return template.innerHTML;
}

function isWhitespaceText(node: Node | null | undefined): node is Text {
  return node?.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "";
}

/**
 * 移動後に補うインデント文字列。移動先の直前の空白、無ければ移動元の直前の空白を使う。
 * どちらも無い（空白を持たない詰めた HTML）ときは整形しない。
 */
function indentTextFor(target: Element, before: Node | null): string | null {
  const destination = before?.previousSibling;
  if (isWhitespaceText(destination)) return destination.data;
  const origin = target.previousSibling;
  return isWhitespaceText(origin) ? origin.data : null;
}

export interface ScreenmockElementOffset {
  leftPx: number;
  topPx: number;
}

/** style 属性から指定プロパティの値を取り出す（無ければ null）。 */
function readDeclaration(style: string | null, name: string): string | null {
  for (const part of (style ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    if (part.slice(0, colon).trim().toLowerCase() !== name) continue;
    return part.slice(colon + 1).trim();
  }
  return null;
}

/**
 * 対象要素をフローに残したままオフセット移動する（自由配置）。
 *
 * `position: absolute` にすると要素がフローから外れて周囲が詰まり、flex アイテムの伸長も
 * 失われて幅が潰れる。`position: relative` + `left` / `top` なら本来の場所を占有したまま
 * 見た目だけずれるため、周囲のレイアウトを壊さない。既に absolute 等が指定されている
 * 要素はその指定を尊重し、座標だけ更新する。オフセットが 0 なら宣言ごと取り除く。
 */
export function applyElementOffset(
  screenHtml: string,
  path: string,
  offset: ScreenmockElementOffset,
): string {
  const template = document.createElement("template");
  template.innerHTML = screenHtml;
  const target = findElementByPath(template.content, path);
  if (!target) return screenHtml;

  const style = target.getAttribute("style");
  const left = Math.round(offset.leftPx);
  const top = Math.round(offset.topPx);

  if (left === 0 && top === 0) {
    const cleared = removeDeclarations(style, ["position", "left", "top"]);
    setStyleAttribute(target, cleared);
  } else {
    // static は配置指定として機能しない（left/top が効かない）ため relative へ読み替える。
    const declared = readDeclaration(style, "position");
    const position = !declared || declared.toLowerCase() === "static" ? "relative" : declared;
    setStyleAttribute(
      target,
      mergeStyleAttribute(style, { position, left: `${left}px`, top: `${top}px` }),
    );
  }

  removePathAttributes(template.content);
  return template.innerHTML;
}

export interface ScreenmockScreenInput {
  id?: string;
  title?: string;
  html: string;
}

export interface ScreenmockScreenMetadata {
  id?: string;
  title?: string;
}

export interface RenameScreenmockScreenOptions {
  updateRefs?: boolean;
}

export function appendScreenmockScreen(source: string, screen: ScreenmockScreenInput): string {
  let normalized = source.replace(/\r\n?/g, "\n");
  const frontmatter = serializeFrontmatter(screen);
  if (!normalized.trim()) {
    return frontmatter.length ? [...frontmatter, screen.html].join("\n") : screen.html;
  }
  normalized = ensureLeadingFrontmatterBlock(normalized, screen.id);
  return [normalized.replace(/\n*$/, ""), ...frontmatterForSeparatedBlock(screen), screen.html].join("\n");
}

/**
 * frontmatter なしの単一画面ソースは、後続へ `---` ブロックを足しても 1 画面の本文として
 * 飲み込まれる（parseScreenBlocks の bare 分岐が EOF まで取るため）。複数画面化する前に
 * 既存本文を明示 frontmatter ブロックへ変換する。
 */
function ensureLeadingFrontmatterBlock(normalized: string, reservedId?: string): string {
  const blocks = parseScreenBlocks(normalized);
  if (blocks.length !== 1 || blocks[0].frontmatterStart !== null) return normalized;
  const bareId =
    reservedId === "screen-1" ? uniqueScreenId("screen-1", new Set([reservedId]), "1") : "screen-1";
  return renameScreenmockScreen(normalized, 0, { id: bareId });
}

export function duplicateScreenmockScreen(source: string, screenIndex: number): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks = parseScreenBlocks(normalized);
  const block = blocks[screenIndex];
  if (!block) return normalized;
  if (block.frontmatterStart === null) {
    // 複製側だけ frontmatter 化しても、bare のままの元画面が後続ブロックを本文として
    // 飲み込む（appendScreenmockScreen と同根）。先に元画面を frontmatter 化して再帰する。
    return duplicateScreenmockScreen(ensureLeadingFrontmatterBlock(normalized), screenIndex);
  }

  const metadata = parseFrontmatter(block.frontmatter) ?? {};
  const nextId = uniqueScreenId(screenIdFor(metadata, screenIndex), collectScreenIds(blocks), `${screenIndex + 2}`);
  const duplicateLines = lines.slice(block.blockStart, block.blockEnd);
  const localStart = block.frontmatterStart - block.blockStart;
  const localEnd = block.frontmatterEnd === null ? localStart : block.frontmatterEnd - block.blockStart;
  duplicateLines.splice(localStart, localEnd - localStart, ...upsertFrontmatterLines(block.frontmatter, { id: nextId }));

  return [...lines.slice(0, block.blockEnd), ...duplicateLines, ...lines.slice(block.blockEnd)].join("\n");
}

export function removeScreenmockScreen(source: string, screenIndex: number): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks = parseScreenBlocks(normalized);
  const block = blocks[screenIndex];
  if (!block) return normalized;
  if (blocks.length === 1) return "";
  return [...lines.slice(0, block.blockStart), ...lines.slice(block.blockEnd)].join("\n").replace(/^\n+|\n+$/g, "");
}

export function moveScreenmockScreen(source: string, fromIndex: number, toIndex: number): string {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks = parseScreenBlocks(normalized);
  if (blocks.length <= 1) return normalized;
  const fromBlock = blocks[fromIndex];
  if (!fromBlock) return normalized;
  const clampedToIndex = Math.max(0, Math.min(toIndex, blocks.length - 1));
  if (fromIndex === clampedToIndex) return normalized;

  const blockLineGroups = blocks.map((block) => lines.slice(block.blockStart, block.blockEnd));
  const [moved] = blockLineGroups.splice(fromIndex, 1);
  blockLineGroups.splice(clampedToIndex, 0, moved);
  return blockLineGroups.flat().join("\n").replace(/^\n+|\n+$/g, "");
}

export function renameScreenmockScreen(
  source: string,
  screenIndex: number,
  metadata: ScreenmockScreenMetadata,
  opts: RenameScreenmockScreenOptions = {},
): string {
  let normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks = parseScreenBlocks(normalized);
  const block = blocks[screenIndex];
  if (!block) return normalized;

  const previousMetadata = parseFrontmatter(block.frontmatter) ?? {};
  const previousId = previousMetadata.id;
  let nextLines: string[];
  if (block.frontmatterStart !== null && block.frontmatterEnd !== null) {
    nextLines = [
      ...lines.slice(0, block.frontmatterStart),
      ...upsertFrontmatterLines(block.frontmatter, metadata),
      ...lines.slice(block.frontmatterEnd),
    ];
  } else {
    nextLines = [...serializeFrontmatter(metadata), ...lines.slice(block.bodyStart, block.bodyEnd)];
  }
  normalized = nextLines.join("\n");

  if (opts.updateRefs && previousId && metadata.id && previousId !== metadata.id) {
    normalized = replaceHrefScreenRefs(normalized, previousId, metadata.id);
  }
  return normalized;
}

function setStyleAttribute(target: Element, style: string): void {
  if (style.trim()) target.setAttribute("style", style);
  else target.removeAttribute("style");
}

function removeDeclarations(style: string | null, names: string[]): string {
  return (style ?? "")
    .split(";")
    .filter((part) => {
      const colon = part.indexOf(":");
      if (colon < 0) return part.trim() !== "";
      return !names.includes(part.slice(0, colon).trim().toLowerCase());
    })
    .map((part) => `${part.trim()};`)
    .join(" ");
}

function serializeFrontmatter(metadata: ScreenmockScreenMetadata): string[] {
  const lines: string[] = ["---"];
  if (metadata.id !== undefined) lines.push(`id: ${metadata.id}`);
  if (metadata.title !== undefined) lines.push(`title: ${metadata.title}`);
  lines.push("---");
  return lines;
}

function frontmatterForSeparatedBlock(metadata: ScreenmockScreenMetadata): string[] {
  return serializeFrontmatter(metadata);
}

function upsertFrontmatterLines(lines: string[], metadata: ScreenmockScreenMetadata): string[] {
  const next = [...lines];
  for (const key of ["id", "title"] as const) {
    const value = metadata[key];
    if (value === undefined) continue;
    const index = next.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
    if (index >= 0) next[index] = `${key}: ${value}`;
    else next.push(`${key}: ${value}`);
  }
  return next;
}

function screenIdFor(metadata: ScreenmockScreenMetadata, index: number): string {
  return metadata.id || `screen-${index + 1}`;
}

function collectScreenIds(blocks: ScreenBlock[]): Set<string> {
  return new Set(blocks.map((block, index) => screenIdFor(parseFrontmatter(block.frontmatter) ?? {}, index)));
}

function uniqueScreenId(base: string, used: Set<string>, fallback: string): string {
  const normalizedBase = base.trim() || `screen-${fallback}`;
  for (let index = 1; ; index += 1) {
    const candidate = index === 1 ? `${normalizedBase}-copy` : `${normalizedBase}-copy-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceHrefScreenRefs(source: string, fromId: string, toId: string): string {
  return source.replace(
    new RegExp(`href=(["'])#${escapeRegExp(fromId)}\\1`, "g"),
    (_match, quote: string) => `href=${quote}#${toId}${quote}`,
  );
}
