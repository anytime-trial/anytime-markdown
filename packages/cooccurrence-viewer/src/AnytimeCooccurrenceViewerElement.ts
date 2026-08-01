/**
 * `<anytime-cooccurrence-viewer>` Custom Element — cooccurrence-viewer の vanilla mount API
 * （{@link mountCooccurrenceViewer}）をフレームワーク非依存の Web Component で包む。
 *
 * markdown-editor の `AnytimeMarkdownEditorElement` と同じ anytime WC 規約に揃える。
 * スタイルは Light DOM（mount が `document.head` へ注入するスタイルとテーマ変数がそのまま適用される。
 * テーマ変数は mount 自身が root へ適用するため、この要素での自給処理は不要）。
 *
 * I/F（要件書 cooccurrence-viewer-web-component §2.2）:
 * - 属性: `theme`（light/dark）/ `skin`（standard/oz）/ `locale` / `show-panels`
 *   （`show-panels` は未指定で mount 既定の true。`show-panels="false"` のみ折り畳み）
 * - プロパティ: `file`（{@link CooccurrenceFile}。長大データのため属性ではなく property）/
 *   `value`（`.cooc.json` の JSON 文字列版。素の HTML からの受け渡し用）
 * - プロパティ: `options`（フル {@link CooccurrenceViewerOptions} の escape hatch。callback /
 *   `capabilities` / `filter` / `createLayoutWorker` 等を渡す経路。属性由来の既定をオーバーライドする）
 * - メソッド: `update(patch)`（live props 反映・handle.update 委譲）
 * - イベント: `change`（図の編集時。`detail.file`）/ `save-request`（`detail.file`）/
 *   `export-png`（`detail.blob`）。いずれも bubbles / composed
 *
 * 既定の `capabilities` は `{ exportPng: true }`。PNG 書き出しはホスト側の保存先を要さず
 * 単体埋め込みでもそのまま意味を持つため既定で有効にする。保存（`save`）はホストの保存先が
 * 必要なため既定では無効で、`options.capabilities` で明示的に有効化する。
 */

import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from './mountCooccurrenceViewer';
import type {
  CooccurrenceSkin,
  CooccurrenceViewerHandle,
  CooccurrenceViewerOptions,
  CooccurrenceViewerUpdate,
  ThemeMode,
} from './types';
import { createInlineLayoutWorker } from './worker/createInlineLayoutWorker';

/**
 * SSR/Node 安全化: `HTMLElement` 未定義環境でも class 定義時に ReferenceError を投げないよう
 * ダミー基底へフォールバックする（markdown-editor と同じ）。
 */
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);

const HOST_STYLE_ID = 'anytime-cooccurrence-viewer-host-style';

/**
 * ホスト要素の display 既定（block）を注入する（1 回だけ）。
 *
 * inline style（`this.style.display`）で与えないのは、インライン宣言が consumer の
 * スタイルシート（`anytime-cooccurrence-viewer { display: flex }` 等）に常に勝ってしまう
 * ためである。`:where()` で詳細度を 0 に落とし、consumer のどんなルールにも負ける
 * 「未指定時の既定」だけを提供する。
 */
function ensureHostStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOST_STYLE_ID;
  style.textContent = ':where(anytime-cooccurrence-viewer) { display: block; }';
  document.head.appendChild(style);
}

/** `change` / `save-request` イベントの `detail`。 */
export interface CooccurrenceFileDetail {
  file: CooccurrenceFile;
}

/** `export-png` イベントの `detail`。 */
export interface CooccurrenceExportPngDetail {
  blob: Blob;
}

export class AnytimeCooccurrenceViewerElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['theme', 'skin', 'locale', 'show-panels'];
  }

  private handle: CooccurrenceViewerHandle | null = null;
  /** connect 前に set された保留値、または編集反映後の現在ファイル。 */
  private cachedFile: CooccurrenceFile | null = null;
  /** フル options（escape hatch）。属性由来の既定より優先される。 */
  private fullOptions: Partial<CooccurrenceViewerOptions> = {};

  connectedCallback(): void {
    // canvas が要素の実寸へ追従するため、inline 既定のままだと高さゼロで何も見えない。
    ensureHostStyle();
    this.mount();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.handle) return;
    if (name === 'theme') {
      this.handle.update({ themeMode: this.currentTheme() });
      return;
    }
    if (name === 'skin') {
      this.handle.update({ skin: this.currentSkin() });
      return;
    }
    if (name === 'show-panels') {
      this.handle.update({ showPanels: this.currentShowPanels() ?? true });
      return;
    }
    // locale は mount 時定数のため現在値を保持したまま再 mount する。
    if (this.isConnected) {
      this.teardown();
      this.mount();
    }
  }

  /** 図データ（`CooccurrenceFile`）で授受する。編集結果は `change` イベントと本 getter の両方へ反映される。 */
  set file(next: CooccurrenceFile | null) {
    this.cachedFile = next;
    if (!next) {
      this.teardown();
      return;
    }
    if (this.handle) {
      this.handle.update({ file: next });
      return;
    }
    if (this.isConnected) this.mount();
  }

  get file(): CooccurrenceFile | null {
    return this.cachedFile;
  }

  /**
   * `.cooc.json` の JSON 文字列版。素の HTML から `fetch` 結果などをそのまま渡す用途。
   * parse 失敗時は throw せず console.error を残して現状を維持する（要件書 §2.2）。
   */
  set value(next: string) {
    try {
      this.file = JSON.parse(next) as CooccurrenceFile;
    } catch (error) {
      console.error(
        '[cooccurrence-viewer] Failed to parse value as .cooc.json. Keeping the current file.',
        error,
      );
    }
  }

  get value(): string {
    return this.cachedFile ? JSON.stringify(this.cachedFile) : '';
  }

  /**
   * フル options（escape hatch）。属性で表現できないオプションを渡す経路。
   * 設定済みで mount 中なら現在ファイルを保持して再 mount する（生成時オプション契約）。
   */
  set options(next: Partial<CooccurrenceViewerOptions>) {
    this.fullOptions = next ?? {};
    if (this.handle) {
      this.teardown();
      this.mount();
    } else if (this.isConnected) {
      this.mount();
    }
  }

  get options(): Partial<CooccurrenceViewerOptions> {
    return this.fullOptions;
  }

  /** live props（file / themeMode / skin / filter 等）を handle.update へ委譲する。 */
  update(patch: CooccurrenceViewerUpdate): void {
    this.handle?.update(patch);
  }

  /** mount 済みハンドル（観測点 getter 群への入口）。未 mount なら null。 */
  get viewer(): CooccurrenceViewerHandle | null {
    return this.handle;
  }

  private mount(): void {
    if (this.handle || !this.cachedFile) return;
    const opts = this.fullOptions;
    // 属性由来の既定 → フル options で上書き → callback は emit と consumer 提供の両方を
    // 呼ぶラッパで最後に確定する（markdown-editor と同じ合成順）。
    const userOnFileChange = opts.onFileChange;
    const userOnExportPng = opts.onExportPng;
    const userOnRequestSave = opts.onRequestSave;
    this.handle = mountCooccurrenceViewer(this, {
      themeMode: this.currentTheme(),
      skin: this.currentSkin(),
      locale: this.getAttribute('locale') ?? undefined,
      showPanels: this.currentShowPanels(),
      createLayoutWorker: createInlineLayoutWorker,
      capabilities: { exportPng: true },
      ...opts,
      file: this.cachedFile,
      onFileChange: (file) => {
        this.cachedFile = file;
        this.emit<CooccurrenceFileDetail>('change', { file });
        userOnFileChange?.(file);
      },
      onExportPng: (blob) => {
        this.emit<CooccurrenceExportPngDetail>('export-png', { blob });
        userOnExportPng?.(blob);
      },
      onRequestSave: (file) => {
        this.cachedFile = file;
        this.emit<CooccurrenceFileDetail>('save-request', { file });
        userOnRequestSave?.(file);
      },
    });
  }

  private teardown(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  private currentTheme(): ThemeMode {
    return this.getAttribute('theme') === 'dark' ? 'dark' : 'light';
  }

  private currentSkin(): CooccurrenceSkin {
    return this.getAttribute('skin') === 'oz' ? 'oz' : 'standard';
  }

  /** 未指定は undefined（mount 既定の true に委ねる）。`"false"` のみ折り畳み。 */
  private currentShowPanels(): boolean | undefined {
    const raw = this.getAttribute('show-panels');
    if (raw === null) return undefined;
    return raw !== 'false';
  }

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }
}
