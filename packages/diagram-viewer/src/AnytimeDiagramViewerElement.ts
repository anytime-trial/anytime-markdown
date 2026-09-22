/**
 * `<anytime-diagram-viewer>` Custom Element — 系図の vanilla mount API
 * （{@link mountDiagramViewer}）をフレームワーク非依存の Web Component で包む。
 *
 * cooccurrence-viewer の `AnytimeCooccurrenceViewerElement` と同じ anytime WC 規約に揃える。
 * スタイルは Light DOM で、`mountDiagramViewer` が自分の配下へ `<style>` を入れるため、宿主側の
 * 注入は要らない。
 *
 * I/F は要件書 `spec/37.diagram/diagram-viewer-web-component.ja.md` §3.2。
 *
 * - 属性: `theme`（light/dark）/ `locale` / `editable` / `compact` / `always-editing`
 * - プロパティ: `document`（{@link DiagramDocument}。長大データのため属性ではなく property）/
 *   `value`（`.diagram.json` の JSON 文字列版）/ `elementAnnex` / `options`（escape hatch）
 * - メソッド: `update(patch)` / `save()` / `getDraft()`
 * - イベント: `save-request` / `draft-change` / `element-select` / `element-annex`
 *   （いずれも bubbles / composed）
 */

import type { DiagramDocument } from '@anytime-markdown/diagram-core';
import { ensureStyle } from '@anytime-markdown/ui-core/dom';
import { HTMLElementBase } from '@anytime-markdown/ui-core/ssrSafeElement';

import { mountDiagramViewer } from './mountDiagramViewer';
import { DIAGRAM_THEME_TOKENS } from './theme/diagramStyles';
import type {
  DiagramElementAnnex,
  DiagramViewerHandle,
  DiagramViewerOptions,
  DiagramViewerUpdate,
} from './types';

const HOST_STYLE_ID = 'anytime-diagram-viewer-host-style';

/**
 * ホスト要素の display 既定（flex 列）を注入する（1 回だけ）。
 *
 * inline style で与えないのは、インライン宣言が宿主のスタイルシートに常に勝つため。
 * `:where()` で詳細度を 0 に落とし、宿主のどんな規則にも負ける「未指定時の既定」だけを配る。
 *
 * 図の根は残りの高さをすべて取る（`flex: 1 1 auto`）ので、ホストにも縦の器を与えないと
 * 中身の高さで止まり、図の枠が最小高さまで縮む。
 */
function ensureHostStyle(): void {
  ensureStyle(
    HOST_STYLE_ID,
    ':where(anytime-diagram-viewer) { display: flex; flex-direction: column; min-height: 0; }',
  );
}

/** `save-request` イベントの `detail`。 */
export interface DiagramDocumentDetail {
  document: DiagramDocument;
}

/** `draft-change` イベントの `detail`。`null` は編集していない状態。 */
export interface DiagramDraftDetail {
  draft: DiagramDocument | null;
}

/** `element-select` イベントの `detail`。`name` の `null` は選びを外したこと。 */
export interface DiagramElementSelectDetail {
  name: string | null;
  additive: boolean;
}

/** `element-annex` イベントの `detail`。`id` は宿主が決めた鍵で、viewer は解釈していない。 */
export interface DiagramElementAnnexDetail {
  name: string;
  id: string;
}

export class AnytimeDiagramViewerElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['theme', 'locale', 'editable', 'compact', 'always-editing'];
  }

  private handle: DiagramViewerHandle | null = null;
  /** connect 前に set された保留値、または保存後の現在の図。 */
  private cachedDocument: DiagramDocument | null = null;
  private cachedAnnex: Readonly<Record<string, DiagramElementAnnex>> = {};
  /** フル options（escape hatch）。属性由来の既定より優先される。 */
  private fullOptions: Partial<DiagramViewerOptions> = {};

  connectedCallback(): void {
    ensureHostStyle();
    this.applyThemeTokens();
    this.mount();
  }

  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'theme') {
      // 配色は mount していなくても当てる。図が来る前のホストの地の色が食い違わないようにする。
      this.applyThemeTokens();
      return;
    }
    if (!this.handle) return;
    if (name === 'always-editing') {
      // 常時編集は mount 時に決まる（下書きの始め方が変わる）。現在の図を保ったまま張り直す。
      this.teardown();
      this.mount();
      return;
    }
    // locale / editable / compact は handle が差分で受けられるので再 mount しない。
    this.handle.update(this.liveUpdate());
  }

  /** 図データ。保存の結果は `save-request` イベントと本 getter の両方へ反映される。 */
  set document(next: DiagramDocument | null) {
    this.cachedDocument = next;
    if (!next) {
      this.teardown();
      return;
    }
    if (this.handle) {
      this.handle.update({ document: next });
      return;
    }
    if (this.isConnected) this.mount();
  }

  get document(): DiagramDocument | null {
    return this.cachedDocument;
  }

  /**
   * `.diagram.json` の JSON 文字列版。素の HTML から `fetch` の結果をそのまま渡す用途。
   *
   * parse 失敗時は throw せず、記録を残して現状を保つ。図が 1 枚出ている画面で、差し替えに
   * 失敗した瞬間に画面が空になるほうが害が大きい。
   */
  set value(next: string) {
    try {
      this.document = JSON.parse(next) as DiagramDocument;
    } catch (error) {
      console.error(
        '[diagram-viewer] Failed to parse value as .diagram.json. Keeping the current document.',
        error,
      );
    }
  }

  get value(): string {
    return this.cachedDocument ? JSON.stringify(this.cachedDocument) : '';
  }

  /** 要素ごとに札へ添える項目群。図より後に読み終えても差し替えで届く。 */
  set elementAnnex(next: Readonly<Record<string, DiagramElementAnnex>> | null) {
    this.cachedAnnex = next ?? {};
    this.handle?.update({ elementAnnex: this.cachedAnnex });
  }

  get elementAnnex(): Readonly<Record<string, DiagramElementAnnex>> {
    return this.cachedAnnex;
  }

  /**
   * フル options（escape hatch）。属性で表現できないものを渡す経路。
   *
   * mount 済みなら現在の図を保ったまま張り直す（生成時にしか効かない項目があるため）。
   */
  set options(next: Partial<DiagramViewerOptions>) {
    this.fullOptions = next ?? {};
    if (this.handle) {
      this.teardown();
      this.mount();
    } else if (this.isConnected) {
      this.mount();
    }
  }

  get options(): Partial<DiagramViewerOptions> {
    return this.fullOptions;
  }

  update(patch: DiagramViewerUpdate): void {
    if (patch.document !== undefined) this.cachedDocument = patch.document;
    if (patch.elementAnnex !== undefined) this.cachedAnnex = patch.elementAnnex;
    this.handle?.update(patch);
  }

  /** 保存する。図の中の保存ボタンと同じ経路を通る。未 mount なら何もしない。 */
  async save(): Promise<void> {
    await this.handle?.save();
  }

  /** 編集中の下書き。`null` は編集していない状態。 */
  getDraft(): DiagramDocument | null {
    return this.handle?.getDraft() ?? null;
  }

  /** mount 済みハンドル。未 mount なら null。 */
  get viewer(): DiagramViewerHandle | null {
    return this.handle;
  }

  private mount(): void {
    if (this.handle || !this.cachedDocument) return;
    const opts = this.fullOptions;
    const userOnSave = opts.onSave;
    const userOnDraftChange = opts.onDraftChange;
    const userOnSelect = opts.onSelect;
    const userOnAnnexActivate = opts.onAnnexActivate;
    this.handle = mountDiagramViewer(this, {
      locale: this.getAttribute('locale') ?? undefined,
      editable: this.hasAttribute('editable'),
      compact: this.hasAttribute('compact'),
      alwaysEditing: this.hasAttribute('always-editing'),
      ...opts,
      document: this.cachedDocument,
      elementAnnex: this.cachedAnnex,
      onSave: (saved) => {
        this.cachedDocument = saved;
        this.emit<DiagramDocumentDetail>('save-request', { document: saved });
        return userOnSave?.(saved);
      },
      onDraftChange: (draft) => {
        this.emit<DiagramDraftDetail>('draft-change', { draft });
        userOnDraftChange?.(draft);
      },
      onSelect: (name, additive) => {
        this.emit<DiagramElementSelectDetail>('element-select', { name, additive });
        userOnSelect?.(name, additive);
      },
      /*
        押下の受け口は**宿主が渡していなくても常に張る**。項目を押せるかどうかは、この要素を
        使う宿主にとってはイベントを聴くかどうかで決まる — `options` を渡さない素の HTML でも
        `element-annex` を聴けば動く形にしないと、escape hatch を通らない限り押せない札になる。
      */
      onAnnexActivate: (name, id) => {
        this.emit<DiagramElementAnnexDetail>('element-annex', { name, id });
        userOnAnnexActivate?.(name, id);
      },
    });
  }

  private teardown(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  /** `handle.update` が差分で受けられる項目だけを集める。 */
  private liveUpdate(): DiagramViewerUpdate {
    return {
      locale: this.getAttribute('locale') ?? undefined,
      editable: this.hasAttribute('editable'),
      compact: this.hasAttribute('compact'),
    };
  }

  /**
   * 配色トークンを**自分自身へ**当てる。
   *
   * 図のスタイルは色を自前で持たず宿主のトークンを引くが、最後の既定値はライトの一式しか
   * 持たない。トークンを撒いていない宿主（素の HTML）では、この要素が与えない限りダークが
   * 成立しない。宿主が `--am-color-*` を撒いている場合は、そちらが継承で勝つわけではない
   * ので、**この要素を使う宿主は「撒いていない側」である**という前提に立つ。
   */
  private applyThemeTokens(): void {
    const tokens = DIAGRAM_THEME_TOKENS[this.getAttribute('theme') === 'dark' ? 'dark' : 'light'];
    for (const [name, value] of Object.entries(tokens)) this.style.setProperty(name, value);
  }

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }
}
