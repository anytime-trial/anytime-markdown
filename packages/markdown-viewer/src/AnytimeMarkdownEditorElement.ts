/**
 * `<anytime-markdown-editor>` Custom Element — markdown-viewer の vanilla mount API
 * （{@link mountVanillaMarkdownEditor}）をフレームワーク非依存の Web Component で包む。
 *
 * mindmap-viewer / anytime-spreadsheet と同じ anytime WC 規約に揃える。スタイルは Light DOM
 * （既定）で `document.head` 注入クラスと editor root スコープのテーマ CSS 変数がそのまま適用される。
 *
 * I/F:
 * - 属性: `theme`（light/dark）/ `read-only` / `locale` / `placeholder`
 * - プロパティ: `value`（Markdown 文字列。長大データのため属性ではなく property）
 * - イベント: `change`（編集時。`detail.value` に現在の Markdown。composed: true）
 *
 * rich 版（mermaid/katex/plantuml）は本クラスを継承し {@link mountEditor} を差し替える
 * （markdown-rich の `AnytimeMarkdownRichEditorElement`）。
 */

import { createMarkdownT } from "./i18n/createMarkdownT";
import {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "./host/vanillaMarkdownEditor";
import { getMarkdownFromEditorSafe } from "./utils/markdownSerializer";

/** `detail` が `{ value }` の `change` イベント。 */
export interface MarkdownChangeDetail {
  value: string;
}

export class AnytimeMarkdownEditorElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["theme", "read-only", "locale", "placeholder"];
  }

  private handle: VanillaMarkdownEditorHandle | null = null;
  /** connect 前に set された保留値、または現在の Markdown キャッシュ。 */
  private cachedValue = "";
  /** 最後に通知した値。これと一致する onContentChange は再発火しない（プログラム set の抑止）。 */
  private lastEmitted = "";

  connectedCallback(): void {
    this.mount();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.handle) return;
    if (name === "theme") {
      this.handle.update({ themeMode: this.currentTheme() });
      return;
    }
    if (name === "read-only") {
      this.handle.update({ readOnly: this.hasAttribute("read-only") });
      return;
    }
    // locale / placeholder は mount 時定数のため現在値を保持したまま再 mount する。
    if (this.isConnected) {
      this.cachedValue = this.value;
      this.teardown();
      this.mount();
    }
  }

  /** Markdown 文字列で本文を授受する。 */
  set value(next: string) {
    if (next === this.value) return;
    this.cachedValue = next;
    this.lastEmitted = next; // 直後の onContentChange（= next）を change として再発火させない。
    if (this.isConnected) {
      this.teardown();
      this.mount();
    }
  }

  get value(): string {
    if (this.handle) {
      const md = getMarkdownFromEditorSafe(this.handle.editor);
      if (md != null) {
        this.cachedValue = md;
        return md;
      }
    }
    return this.cachedValue;
  }

  /**
   * 実際の mount 処理。rich 版はこれを override して
   * {@link mountVanillaRichMarkdownEditor} を呼ぶ。
   */
  protected mountEditor(
    container: HTMLElement,
    options: MountVanillaMarkdownEditorOptions,
  ): VanillaMarkdownEditorHandle {
    return mountVanillaMarkdownEditor(container, options);
  }

  private mount(): void {
    const locale = this.getAttribute("locale") ?? undefined;
    this.handle = this.mountEditor(this, {
      t: createMarkdownT("MarkdownEditor", locale),
      locale,
      initialContent: this.cachedValue,
      readOnly: this.hasAttribute("read-only"),
      placeholder: this.getAttribute("placeholder") ?? undefined,
      themeMode: this.currentTheme(),
      onContentChange: (markdown) => this.emitChange(markdown),
    });
  }

  private teardown(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  private currentTheme(): "light" | "dark" {
    return this.getAttribute("theme") === "dark" ? "dark" : "light";
  }

  private emitChange(markdown: string): void {
    this.cachedValue = markdown;
    if (markdown === this.lastEmitted) return;
    this.lastEmitted = markdown;
    const detail: MarkdownChangeDetail = { value: markdown };
    this.dispatchEvent(
      new CustomEvent<MarkdownChangeDetail>("change", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
