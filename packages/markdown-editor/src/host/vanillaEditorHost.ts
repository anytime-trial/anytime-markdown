import { Editor, type EditorOptions } from "@anytime-markdown/markdown-core";

/**
 * framework-decoupling Phase 3 / G（vanilla host）の seam。
 *
 * React（markdown-react の `useEditor` / `EditorContent`）を介さずに editor を mount する
 * 最小ホスト。`new Editor({ element })`（markdown-core の core Editor）は content（native
 * NodeView）を `element` 内へ直接描画するため、React ランタイムを必要としない。
 *
 * chrome（block の選択ツールバー等、すでに脱React 済みの `createXxxBlockChrome`）は
 * `installChrome` フックで装着する（host 自身は特定 chrome を知らない＝合成は呼び出し側）。
 * 編集ダイアログ等の重量 UI は今なお React host が担うため、完全な vanilla 画面は後続フェーズ
 * （F: ui kit / G2: chrome・dialogs の vanilla 化）で揃う。本 seam はその土台。
 */

export interface VanillaEditorHostOptions extends Partial<EditorOptions> {
  /** editor を mount する DOM 要素。 */
  element: HTMLElement;
  /**
   * 生成直後に chrome（block toolbar 等）を装着するフック。
   * 返した破棄関数は host の `destroy()` でまとめて呼ばれる。
   */
  installChrome?: (editor: Editor) => Array<() => void>;
}

export interface VanillaEditorHostHandle {
  /** mount 済みの core Editor（React 非依存）。 */
  readonly editor: Editor;
  /** chrome 破棄 + editor 破棄。 */
  destroy(): void;
}

/**
 * vanilla（React 非依存）で markdown editor を mount する。戻り値の `destroy()` で後始末する。
 */
export function createVanillaEditorHost(
  options: VanillaEditorHostOptions,
): VanillaEditorHostHandle {
  const { element, installChrome, ...editorOptions } = options;
  const editor = new Editor({ ...editorOptions, element });
  const disposers = installChrome ? installChrome(editor) : [];

  return {
    editor,
    destroy() {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (e) {
          // chrome 破棄の失敗で editor 破棄を止めない（残りも破棄する）。
          console.error("[vanillaEditorHost] chrome dispose failed:", e);
        }
      }
      if (!editor.isDestroyed) editor.destroy();
    },
  };
}
