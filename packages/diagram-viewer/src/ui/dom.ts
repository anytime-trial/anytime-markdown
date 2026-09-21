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

/**
 * その押下が「選択へ足す」意味か。**Ctrl・⌘・Shift のどれでも足す**。
 *
 * 宿主（VS Code の webview と web-app）と利用者の環境が混ざるので、1 つに決め打たない。
 * 決め打つと、その修飾キーが宿主に取られている環境で複数選択の手段がまるごと消える。
 */
export function additiveFrom(event: MouseEvent | KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey;
}

/**
 * 字を当てる。**同じ字なら触らない。**
 *
 * 生き領域（`aria-live` / `role="alert"` / `role="status"`）は、同じ字を入れ直しても子ノードが
 * 差し替わるので DOM の変化として観測され、支援技術が読み上げ直す。描画は指の動きごとに走る
 * ので、知らせが 1 つ出ている状態で図を平行移動すると、その文が数十回読み上げられていた。
 */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
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
