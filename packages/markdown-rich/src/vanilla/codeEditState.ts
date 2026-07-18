/**
 * コードブロック全画面編集状態の vanilla 版 — useCodeBlockEdit の React 非依存移植。
 * applyCodeBlockText は既存 pure function を流用。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { applyCodeBlockText } from "../components/codeblock/useCodeBlockEdit";
import { createTextareaSearchState, type TextareaSearchController } from "./textareaSearch";

export interface CodeEditStateOptions {
  editor: Editor | null;
  pos: number;
  node: PMNode | null;
  onClose: (open: boolean) => void;
}

export interface CodeEditState {
  getCode: () => string;
  getFsCode: () => string;
  isFsDirty: () => boolean;
  isDiscardOpen: () => boolean;
  getSearch: () => TextareaSearchController;
  onFsTextChange: (v: string) => void;
  onFsCodeChange: (e: { target: { value: string } }) => void;
  onApply: () => void;
  tryCloseEdit: () => void;
  setDiscardOpen: (v: boolean) => void;
  handleDiscardConfirm: () => void;
  handleCopyCode: () => void;
  /** ダイアログが開いた時点でコードをスナップショットする */
  onOpen: () => void;
  /** opts を更新（pos/node が変化したとき） */
  update: (opts: Partial<CodeEditStateOptions>) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createCodeEditState(opts: CodeEditStateOptions): CodeEditState {
  let editor = opts.editor;
  let pos = opts.pos;
  let node = opts.node;
  let onClose = opts.onClose;

  let fsCode = "";
  let fsDirty = false;
  let discardOpen = false;
  let originalCode = "";

  const subscribers = new Set<() => void>();
  function notify(): void { for (const fn of subscribers) fn(); }

  const search = createTextareaSearchState("", (newText) => {
    ctrl.onFsTextChange(newText);
  });

  const ctrl: CodeEditState = {
    getCode: () => node?.textContent ?? "",
    getFsCode: () => fsCode,
    isFsDirty: () => fsDirty,
    isDiscardOpen: () => discardOpen,
    getSearch: () => search,

    onFsTextChange(v) {
      fsCode = v;
      fsDirty = v !== originalCode;
      search.updateText(v);
      notify();
    },

    onFsCodeChange(e) { ctrl.onFsTextChange(e.target.value); },

    onApply() {
      if (!editor || pos < 0 || !node) return;
      // 置換範囲は「今の文書のノード長」で測る。前回適用後のスナップショットを使うと
      // 長さがずれて本文の一部を取り残す・削りすぎる。
      const currentNode = editor.state?.doc?.nodeAt(pos) ?? node;
      applyCodeBlockText(editor, pos, currentNode.content.size, fsCode);
      node = editor.state?.doc?.nodeAt(pos) ?? currentNode;
      originalCode = fsCode;
      fsDirty = false;
      notify();
      onClose(false);
    },

    tryCloseEdit() {
      if (fsDirty) {
        discardOpen = true;
        notify();
      } else {
        onClose(false);
      }
    },

    setDiscardOpen(v) {
      discardOpen = v;
      notify();
    },

    handleDiscardConfirm() {
      discardOpen = false;
      fsDirty = false;
      notify();
      onClose(false);
    },

    handleCopyCode() {
      const code = node?.textContent ?? "";
      void navigator.clipboard?.writeText(code);
    },

    onOpen() {
      const code = node?.textContent ?? "";
      fsCode = code;
      originalCode = code;
      fsDirty = false;
      search.updateText(code);
      notify();
    },

    update(newOpts) {
      if (newOpts.editor !== undefined) editor = newOpts.editor;
      if (newOpts.pos !== undefined) pos = newOpts.pos;
      if (newOpts.node !== undefined) node = newOpts.node;
      if (newOpts.onClose !== undefined) onClose = newOpts.onClose;
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
  };

  return ctrl;
}
