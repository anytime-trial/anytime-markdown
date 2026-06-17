/**
 * `<anytime-markdown-editor>` Custom Element — markdown-viewer の vanilla mount API
 * （{@link mountVanillaMarkdownEditor}）をフレームワーク非依存の Web Component で包む。
 *
 * mindmap-viewer / anytime-spreadsheet と同じ anytime WC 規約に揃える。スタイルは Light DOM
 * （既定）で `document.head` 注入クラスと editor root スコープのテーマ CSS 変数がそのまま適用される。
 *
 * I/F:
 * - 属性: `theme`（light/dark）/ `read-only` / `locale` / `placeholder`（簡易・外部埋め込み向け）
 * - プロパティ: `value`（Markdown 文字列。長大データのため属性ではなく property）
 * - プロパティ: `options`（フル {@link MountVanillaMarkdownEditorOptions}・escape hatch）。
 *   fileSystemProvider / 各種 callback / settings 等、属性で表現できない app レベルのオプションを
 *   渡す経路。設定された options は属性由来の既定をオーバーライドする（web-app 等の app consumer 用）。
 * - メソッド: `update(patch)`（live props 反映・handle.update 委譲）
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
  type VanillaMarkdownEditorUpdatePatch,
} from "./host/vanillaMarkdownEditor";
import { getMarkdownFromEditorSafe } from "./utils/markdownSerializer";
import { ensureChromeTokens } from "./utils/applyEditorThemeCssVars";

/** handle から導出する editor 型（markdown-core への直接 import を避ける）。 */
type EditorInstance = VanillaMarkdownEditorHandle["editor"];

/**
 * SSR/Node 安全化: `HTMLElement` 未定義環境でも class 定義時に ReferenceError を投げないよう
 * ダミー基底へフォールバックする（rich / view サブクラスもこの基底を継承するため一括で安全）。
 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

/** `detail` が `{ value }` の `change` イベント。 */
export interface MarkdownChangeDetail {
  value: string;
}

export class AnytimeMarkdownEditorElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ["theme", "read-only", "locale", "placeholder"];
  }

  private handle: VanillaMarkdownEditorHandle | null = null;
  /** connect 前に set された保留値、または現在の Markdown キャッシュ。 */
  private cachedValue = "";
  /** 最後に通知した値。これと一致する onContentChange は再発火しない（プログラム set の抑止）。 */
  private lastEmitted = "";
  /** フル options（escape hatch）。属性由来の既定より優先される。 */
  private fullOptions: Partial<MountVanillaMarkdownEditorOptions> = {};
  /**
   * この要素が chrome テーマトークン（`--am-color-*` 等）を自給したか。
   * host（web-app 等）が未注入の素の consumer（拡張 / CDN）でのみ true になり、
   * theme 切替時に自分が所有するトークンだけを再適用する。
   */
  private ownsChromeTokens = false;

  connectedCallback(): void {
    // host（applyEditorThemeCssVars 呼び出し元）が未注入の素の consumer でも chrome 背景が
    // 透けないよう、未注入時のみテーマトークンを自給する（fill-if-missing）。
    this.ownsChromeTokens = ensureChromeTokens(this.currentTheme());
    this.mount();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.handle) return;
    if (name === "theme") {
      this.handle.update({ themeMode: this.currentTheme() });
      // 自給したトークンのみ再適用する（host 管理時は host が追従するため触らない）。
      if (this.ownsChromeTokens) {
        ensureChromeTokens(this.currentTheme(), { force: true });
      }
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
   * フル options（escape hatch）。app consumer（web-app 等）が属性で表現できない
   * オプション（fileSystemProvider / 各種 callback / settings 等）を渡す経路。
   * 設定済みで connected なら現在値を保持して再 mount する（生成時オプション契約）。
   */
  set options(next: Partial<MountVanillaMarkdownEditorOptions>) {
    this.fullOptions = next ?? {};
    if (this.isConnected) {
      this.cachedValue = this.value;
      this.teardown();
      this.mount();
    }
  }

  get options(): Partial<MountVanillaMarkdownEditorOptions> {
    return this.fullOptions;
  }

  /** live props（readOnly / themeMode / settings 等）を handle.update へ委譲する。 */
  update(patch: VanillaMarkdownEditorUpdatePatch): void {
    this.handle?.update(patch);
  }

  /** mount 済み editor インスタンス（handle adapter 用）。未 mount なら null。 */
  get editor(): EditorInstance | null {
    return this.handle?.editor ?? null;
  }

  /** mount 済み editor root 要素（handle adapter 用）。未 mount なら null。 */
  get root(): HTMLElement | null {
    return this.handle?.root ?? null;
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
    const opts = this.fullOptions;
    const locale = this.getAttribute("locale") ?? opts.locale ?? undefined;
    // 属性由来の既定 → フル options で上書き → onContentChange は emitChange と
    // consumer 提供 callback の両方を呼ぶラッパで最後に確定する。
    const userOnContentChange = opts.onContentChange;
    this.handle = this.mountEditor(this, {
      t: createMarkdownT("MarkdownEditor", locale),
      locale,
      initialContent: this.cachedValue,
      readOnly: this.hasAttribute("read-only"),
      placeholder: this.getAttribute("placeholder") ?? undefined,
      themeMode: this.currentTheme(),
      ...opts,
      onContentChange: (markdown) => {
        this.emitChange(markdown);
        userOnContentChange?.(markdown);
      },
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
