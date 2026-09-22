/** JSON ペインを持たない、系図エディタ専用の全画面ダイアログ。 */
import {
  createEmptyDiagramDocument,
  type DiagramDocument,
  serializeDiagramDocument,
  validateDiagramDocument,
  validateDiagramDraft,
} from "@anytime-markdown/diagram-core";
import { mountDiagramViewer, type DiagramViewerHandle } from "@anytime-markdown/diagram-viewer";
import { createDialog } from "@anytime-markdown/ui-core/Dialog";

import type { CodeEditState } from "./codeEditState";
import { createDialogHeader } from "./dialogHelpers";

export interface CreateDiagramEditDialogOptions {
  label: string;
  isDark: boolean;
  editorBg: string;
  readOnly?: boolean;
  locale?: string;
  state: CodeEditState;
  t: (key: string) => string;
  onClose: () => void;
}

export interface DiagramEditDialogHandle {
  el: HTMLElement;
  destroy: () => void;
}

export function createDiagramEditDialog(opts: CreateDiagramEditDialogOptions): DiagramEditDialogHandle {
  const { state } = opts;
  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "diagram-edit-title",
    paperStyle: { backgroundColor: opts.editorBg },
  });
  const header = createDialogHeader({
    label: opts.label,
    isDark: opts.isDark,
    iconText: "⋔",
    dirty: state.isFsDirty(),
    t: opts.t,
    onApply: opts.readOnly ? undefined : () => apply(),
    onClose: opts.onClose,
  });
  header.el.id = "diagram-edit-title";
  dlg.paper.appendChild(header.el);

  const container = document.createElement("div");
  /*
    **入れ物自身も縦の flex にする。** `flex:1 1 auto` で残りの高さを受け取るのは入れ物だが、
    中身（`.anytime-diagram`）も `flex:1 1 auto` で伸びる作りなので、入れ物が block のままだと
    伸びる相手が居ない。図は中身の高さ（枠の最小 240px）で止まり、ダイアログの下半分が
    空いたまま残る（ユーザー指摘）。
  */
  container.style.cssText = "flex:1 1 auto;min-height:0;display:flex;flex-direction:column;";
  container.style.colorScheme = opts.isDark ? "dark" : "light";
  dlg.paper.appendChild(container);

  function showError(message: string): void {
    const pre = document.createElement("pre");
    // ビューア内部の知らせ（`anytime-diagram-error`）と混ざらない名前にする。
    pre.className = "anytime-diagram-fence-error";
    pre.style.cssText =
      "margin:8px;padding:8px 12px;white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-size:0.8125rem;";
    pre.textContent = `anytime-diagram: ${message}`;
    container.replaceChildren(pre);
  }

  let handle: DiagramViewerHandle | undefined;

  /*
    ヘッダーの「適用」が保存を兼ねる（ユーザー指示）。図の中の保存ボタンは出さないので、
    保存の口はここ 1 つ — 2 つ出すと、どちらが本文へ効くのかを押す前に読めない。

    図を出せていないとき（本文が壊れている・空）は保存する下書きが無いので、従来どおり本文の
    適用だけを行う。押しても何も起きないボタンにしない。
  */
  function apply(): void {
    if (handle === undefined) { state.onApply(); return; }
    void handle.save();
  }

  function mount(): void {
    const code = state.getFsCode();
    // 本文が空のフェンスは「読めない JSON」ではなく「まだ何も無い図」。空の系図から始めさせる
    // （パースエラーを見せても利用者にできることが無い）。
    if (!code.trim()) {
      mountViewer(createEmptyDiagramDocument(opts.t("anytimeDiagram")));
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(code);
    } catch (err) {
      showError(`JSON パースエラー (${err instanceof Error ? err.message : String(err)})`);
      return;
    }
    const validated = validateDiagramDocument(value);
    if (!validated.ok) {
      showError(validated.errors.join("\n"));
      return;
    }
    mountViewer(validated.document);
  }

  function mountViewer(document_: DiagramDocument): void {
    handle = mountDiagramViewer(container, {
      document: document_,
      editable: !opts.readOnly,
      compact: true,
      // 編集そのものを目的に開くダイアログ。閲覧から始めて切替を押させない（切替と保存の口は
      // 図に出さず、保存はヘッダーの「適用」が受け持つ）。
      alwaysEditing: true,
      ...(opts.locale === undefined ? {} : { locale: opts.locale }),
      onDraftChange(draft) {
        if (draft !== null) state.onFsTextChange(serializeDiagramDocument(draft).trimEnd());
      },
      onSave(document) {
        // 届くのは**画面の形**の図（端は種別付き）。ファイルの形を読む `validateDiagramDocument`
        // へ直に渡すと、線を 1 本でも引いた図が保存のたびに断られる。
        const result = validateDiagramDraft(document);
        if (!result.ok) throw new Error(result.errors.join("\n"));
        state.onFsTextChange(serializeDiagramDocument(result.document).trimEnd());
        state.onApply();
        // 続きの編集は**書いた形**から始める。検証が正規化した図を返さないと、本文へ適用した
        // 直後に正規化前の下書きで本文を上書きし、適用済みのはずが未保存に戻る。
        return result.document;
      },
    });
  }

  const unsub = state.subscribe(() => header.update({ dirty: state.isFsDirty() }));
  mount();
  return {
    el: dlg.el,
    destroy() {
      unsub();
      handle?.destroy();
      header.destroy();
      dlg.destroy();
    },
  };
}
