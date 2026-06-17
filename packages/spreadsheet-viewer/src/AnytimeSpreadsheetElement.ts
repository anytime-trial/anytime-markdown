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
import { createChartLayer, type ChartLayer } from "./vanilla/chartLayer";
import type { ChartDefinition } from "./vanilla/chartLayer.types";
import { createChartPanel, type ChartPanelHandle } from "./ui-vanilla/chartPanel";
import { createSpreadsheetT } from "./i18n/createSpreadsheetT";

export type { ChartDefinition };

type SheetFormat = "csv" | "tsv" | "markdown";

/** `detail` が `{ value }` の `change` イベント。 */
export interface SpreadsheetChangeDetail {
  value: string;
}

/** `detail` が `{ charts }` の `chartschange` イベント。 */
export interface SpreadsheetChartsChangeDetail {
  charts: ChartDefinition[];
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

  /** チャートレイヤー（connect 後に生成）。 */
  private chartLayer: ChartLayer | null = null;
  /** connect 前に `charts` を set された場合の保留値。 */
  private pendingCharts: ChartDefinition[] | null = null;
  /** プログラム的な charts set 中は `chartschange` を抑止する。 */
  private applyingCharts = false;
  /** chartLayer 変更購読の解除関数。 */
  private unsubscribeCharts: (() => void) | null = null;
  /** 表示中のチャートパネル（id → handle）。 */
  private chartPanels = new Map<string, ChartPanelHandle>();

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

  /** 現在のチャート定義一覧を返す / 設定する。 */
  get charts(): ChartDefinition[] {
    return this.chartLayer?.getCharts() ?? this.pendingCharts ?? [];
  }

  set charts(defs: ChartDefinition[]) {
    if (!this.chartLayer) {
      this.pendingCharts = [...defs];
      return;
    }
    this.applyingCharts = true;
    try {
      this.chartLayer.setCharts(defs);
    } finally {
      this.applyingCharts = false;
    }
  }

  /**
   * 指定 id のチャートの現在の ChartSpec を ```anytime-chart フェンス形式で返す。
   * id が不正な場合は空文字を返す。
   */
  exportChartFence(id: string): string {
    if (!this.chartLayer) return "";
    const spec = this.chartLayer.getSpec(id);
    if (!spec) return "";
    return `\`\`\`anytime-chart\n${JSON.stringify(spec, null, 2)}\n\`\`\``;
  }

  private mount(): void {
    const initial = this.pendingValue != null ? this.parse(this.pendingValue) : undefined;
    const adapter = createInMemorySheetAdapter(initial, {
      readOnly: this.hasAttribute("read-only"),
    });
    this.adapter = adapter;
    this.unsubscribe = adapter.subscribe(() => this.emitChange());

    // chartLayer 初期化（mountSpreadsheetEditor より先に生成して onCreateChart に渡す）
    const layer = createChartLayer(adapter);
    this.chartLayer = layer;

    const t = createSpreadsheetT("Spreadsheet", this.getAttribute("locale") ?? undefined);

    this.handle = mountSpreadsheetEditor(this, {
      adapter,
      themeMode: this.currentTheme(),
      locale: this.getAttribute("locale") ?? undefined,
      onCreateChart: (range) => {
        const def = layer.addChart({ kind: "line", range });
        this.openChartPanel(def.id, layer, t);
      },
    });
    this.pendingValue = null;

    if (this.pendingCharts) {
      this.applyingCharts = true;
      try {
        layer.setCharts(this.pendingCharts);
      } finally {
        this.applyingCharts = false;
      }
      this.pendingCharts = null;
    }
    this.unsubscribeCharts = layer.subscribe(() => this.emitChartsChange());
  }

  private openChartPanel(
    id: string,
    layer: ChartLayer,
    t: (key: string) => string,
  ): void {
    // 同じ id のパネルが既に開いていれば再利用
    if (this.chartPanels.has(id)) return;

    const panel = createChartPanel({
      isDark: () => this.currentTheme() === "dark",
      getSpec: () => layer.getSpec(id),
      kind: layer.getCharts().find((c) => c.id === id)?.kind ?? "line",
      onKindChange: (kind) => {
        const defs = layer.getCharts().map((c) =>
          c.id === id ? { ...c, kind } : c,
        );
        layer.setCharts(defs);
        panel.update();
      },
      onClose: () => {
        panel.destroy();
        this.chartPanels.delete(id);
      },
      t,
    });

    document.body.appendChild(panel.el);
    this.chartPanels.set(id, panel);
  }

  private teardown(): void {
    this.unsubscribeCharts?.();
    this.unsubscribeCharts = null;
    this.chartLayer?.destroy();
    this.chartLayer = null;
    for (const panel of this.chartPanels.values()) {
      panel.destroy();
    }
    this.chartPanels.clear();
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

  private emitChartsChange(): void {
    if (this.applyingCharts) return;
    const detail: SpreadsheetChartsChangeDetail = { charts: this.charts };
    this.dispatchEvent(
      new CustomEvent<SpreadsheetChartsChangeDetail>("chartschange", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
