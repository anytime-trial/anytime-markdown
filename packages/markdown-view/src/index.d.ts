/** `change` イベントの detail。 */
export interface MarkdownChangeDetail {
  value: string;
}

/**
 * `<anytime-markdown-view>`（figure 同梱 read-only）の要素クラス。
 * - property `value`: Markdown 文字列の授受
 * - property `options`: フル mount オプション（escape hatch）
 * - attribute `theme`（light/dark）/ `locale`
 * - event `change`（detail.value に現在の Markdown）
 */
export declare class AnytimeMarkdownViewElement extends HTMLElement {
  value: string;
  options: Record<string, unknown>;
  update(patch: Record<string, unknown>): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "anytime-markdown-view": AnytimeMarkdownViewElement;
  }
}
