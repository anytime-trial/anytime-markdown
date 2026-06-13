/**
 * `<anytime-spreadsheet>` Custom Element — spreadsheet-viewer の vanilla mount API
 * （{@link mountSpreadsheetEditor}）をフレームワーク非依存の Web Component で包む。
 *
 * mindmap-viewer の `MindmapViewerElement` を anytime WC 規約のテンプレートとし、属性 I/F・
 * プロパティ I/F・CustomEvent・ライフサイクルを揃える。スタイルは Light DOM（既定）で
 * `document.head` 注入の `.sv-*` クラスとテーマ CSS 変数がそのまま適用される。
 *
 * I/F:
 * - 属性: `theme`（light/dark）/ `read-only` / `locale` / `format`（csv|tsv|markdown）
 * - プロパティ: `value`（`format` 準拠の文字列。長大データのため属性ではなく property）
 * - イベント: `change`（ユーザー編集時。`detail.value` に現在値。composed: true）
 */

import {
  createInMemorySheetAdapter,
  parseCsv,
  serializeCsv,
  parseMarkdownTable,
  serializeMarkdownTable,
  type SheetAdapter,
  type SheetSnapshot,
} from "@anytime-markdown/spreadsheet-core";

import {
  mountSpreadsheetEditor,
  type SpreadsheetEditorHandle,
} from "./vanilla/spreadsheetEditor";

type SheetFormat = "csv" | "tsv" | "markdown";

/** `detail` が `{ value }` の `change` イベント。 */
export interface SpreadsheetChangeDetail {
  value: string;
}

/**
 * SSR/Node 安全化: `HTMLElement` 未定義環境（Next の SSR・Node ビルド・barrel 経由の
 * サーバ評価）でも class 定義時に ReferenceError を投げないようダミー基底へフォールバックする。
 * 実際の登録（customElements.define）と動作はブラウザ（HTMLElement 定義済み）でのみ行う。
 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

export class AnytimeSpreadsheetElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ["theme", "read-only", "locale", "format"];
  }

  private handle: SpreadsheetEditorHandle | null = null;
  private adapter: SheetAdapter | null = null;
  private unsubscribe: (() => void) | null = null;
  /** connect 前に `value` を set された場合の保留値。 */
  private pendingValue: string | null = null;
  /** プログラム的な値適用中は `change` を抑止する（プログラム set でのイベント発火を防ぐ）。 */
  private applying = false;

  connectedCallback(): void {
    this.mount();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === "theme") {
      this.handle?.update({ themeMode: this.currentTheme() });
      return;
    }
    // read-only / locale / format は mount 時定数（adapter readOnly・i18n・パース形式）のため
    // 現在値を保持したまま再 mount する。
    if (this.isConnected && this.handle) {
      const value = this.value;
      this.teardown();
      this.pendingValue = value;
      this.mount();
    }
  }

  /** `format` 準拠の文字列で表データを授受する。 */
  set value(next: string) {
    if (!this.adapter) {
      this.pendingValue = next;
      return;
    }
    this.applying = true;
    try {
      this.adapter.replaceAll(this.parse(next));
    } finally {
      this.applying = false;
    }
  }

  get value(): string {
    const snapshot = this.adapter?.getSnapshot();
    if (!snapshot) return this.pendingValue ?? "";
    return this.serialize(snapshot);
  }

  private mount(): void {
    const initial = this.pendingValue != null ? this.parse(this.pendingValue) : undefined;
    const adapter = createInMemorySheetAdapter(initial, {
      readOnly: this.hasAttribute("read-only"),
    });
    this.adapter = adapter;
    this.unsubscribe = adapter.subscribe(() => this.emitChange());
    this.handle = mountSpreadsheetEditor(this, {
      adapter,
      themeMode: this.currentTheme(),
      locale: this.getAttribute("locale") ?? undefined,
    });
    this.pendingValue = null;
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.handle?.destroy();
    this.handle = null;
    this.adapter = null;
  }

  private currentTheme(): "light" | "dark" {
    return this.getAttribute("theme") === "dark" ? "dark" : "light";
  }

  private currentFormat(): SheetFormat {
    const f = this.getAttribute("format");
    return f === "tsv" || f === "markdown" ? f : "csv";
  }

  private parse(text: string): SheetSnapshot {
    const format = this.currentFormat();
    if (format === "markdown") return parseMarkdownTable(text);
    return parseCsv(text, { delimiter: format === "tsv" ? "\t" : "," });
  }

  private serialize(snapshot: SheetSnapshot): string {
    const format = this.currentFormat();
    if (format === "markdown") return serializeMarkdownTable(snapshot);
    return serializeCsv(snapshot, { delimiter: format === "tsv" ? "\t" : "," });
  }

  private emitChange(): void {
    if (this.applying) return;
    const detail: SpreadsheetChangeDetail = { value: this.value };
    this.dispatchEvent(
      new CustomEvent<SpreadsheetChangeDetail>("change", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
