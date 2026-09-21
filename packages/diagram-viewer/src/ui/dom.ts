/** DOM を組み立てる薄い補助。属性の綴りを各所に散らさないために置く。 */

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  options: {
    readonly className?: string;
    readonly text?: string;
    readonly attrs?: Readonly<Record<string, string>>;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) element.setAttribute(key, value);
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

/** クラスの付け外し。条件が偽なら外す（`classList.toggle` の第 2 引数と同じだが意図を名前で示す）。 */
export function setClass(element: Element, name: string, on: boolean): void {
  element.classList.toggle(name, on);
}

/**
 * 属性を値があるときだけ付け、無いときは外す。
 *
 * `setAttribute(key, String(undefined))` で `"undefined"` を書き込む事故を型で塞ぐ。
 */
export function setAttr(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/** ボタンの押せる・押せないを 1 か所で切り替える。 */
export function setDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
}
