/**
 * graph-viewer ui-vanilla 共通の素 DOM ヘルパー。
 *
 * markdown-viewer の ui-vanilla/dom.ts と同一思想だが、graph-viewer から
 * markdown-viewer を import しないためここに最小版を自作する。
 * 依存方向: chrome → ui-vanilla → dom（逆流禁止）。
 */

/** 受け入れ可能な content 形式（string / Node / その配列）。 */
export type VanillaContent = string | Node | readonly (string | Node)[];

/**
 * content を root へ流し込む。string は textNode として追加、Node はそのまま append、
 * 配列は順次。null/undefined は no-op。
 */
export function appendContent(root: HTMLElement, content: VanillaContent | undefined): void {
  if (content == null) return;
  const items = Array.isArray(content) ? content : [content];
  for (const item of items) {
    if (typeof item === 'string') {
      root.appendChild(document.createTextNode(item));
    } else {
      root.appendChild(item as Node);
    }
  }
}

/**
 * `Partial<CSSStyleDeclaration>` を要素へ適用する（null/undefined は no-op）。
 * `--x` 形式のカスタムプロパティは `setProperty` 経由で適用する。
 */
export function applyStyle(
  el: HTMLElement,
  style: Partial<CSSStyleDeclaration> | undefined,
): void {
  if (!style) return;
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key.startsWith('--')) {
      el.style.setProperty(key, String(value));
    } else {
      (el.style as unknown as Record<string, string>)[key] = String(value);
    }
  }
}
