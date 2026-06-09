"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BlockChromeAnchor,
  BlockInlineToolbar,
  DeleteBlockDialog,
  useBlockChrome,
  useEditorSettingsContext,
  useIsDark,
  useMarkdownT,
} from "@anytime-markdown/markdown-viewer";

import { classifyCodeBlock, type CodeBlockKind, CODE_BLOCK_EDIT_INTENT_EVENT } from "./codeblock/CodeBlockBlockContent";

/**
 * codeBlock（CodeBlockWithMermaid）の編集 chrome をページ層で提供する選択駆動
 * オーバーレイ（React）。
 *
 * framework-decoupling Phase 2「反転」設計の chrome 側。content は native
 * {@link createCodeBlockNodeView}（React 非依存）が描画し、本コンポーネントが
 * 選択中の codeBlock に対しツールバー＋全画面編集ダイアログ＋削除/破棄を供給する。
 * 選択検出・位置計測・属性更新・削除・ツールバー表示判定は {@link useBlockChrome} /
 * {@link BlockChromeAnchor} に委譲する。
 *
 * 本コンポーネントは `RichMarkdownEditorPage` にマウントするが、旧 React NodeView
 * との二重描画を避けるため、マウント＋登録差替えは S5（flip）で同時に行う。
 *
 * 段階導入: S3a=骨格（選択折畳み・CSS 変数・編集インテント・削除・ツールバー）、
 * S3b=全画面編集ダイアログ、S4=graph/zoom。
 */

/** ブロック種別とラベル文言を解決する（MermaidNodeView の各 label と一致）。 */
export function codeBlockToolbarLabel(
  kind: CodeBlockKind,
  language: string,
  t: (key: string) => string,
): string {
  switch (kind) {
    case "math": return "Math";
    case "html": return t("htmlPreview");
    case "diagram": return language === "mermaid" ? t("mermaid") : t("plantuml");
    case "embed": return "Embed";
    default: return language ? `Code (${language})` : "Code";
  }
}

/**
 * 選択移動に応じて「前ブロックを折畳み・新ブロックを展開」する transaction を適用する。
 * native NodeView は selection 変化で update されないため、overlay が codeCollapsed を駆動する。
 * 属性が実際に変わるときだけ dispatch する（無変化なら command が false を返し no-op）。
 */
export function applySelectionCollapse(editor: Editor, prevPos: number, curPos: number): void {
  const { doc } = editor.state;
  editor
    .chain()
    .command(({ tr }) => {
      let changed = false;
      if (prevPos >= 0 && prevPos < doc.content.size) {
        const pn = doc.nodeAt(prevPos);
        if (pn?.type.name === "codeBlock" && !pn.attrs.codeCollapsed) {
          tr.setNodeAttribute(prevPos, "codeCollapsed", true);
          changed = true;
        }
      }
      if (curPos >= 0) {
        const cn = doc.nodeAt(curPos);
        if (cn?.type.name === "codeBlock" && cn.attrs.codeCollapsed) {
          tr.setNodeAttribute(curPos, "codeCollapsed", false);
          changed = true;
        }
      }
      return changed;
    })
    .run();
}

export function CodeBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();
  const { pos, node, rect, updateAttrs, deleteOpen, setDeleteOpen, handleDelete, showToolbar } =
    useBlockChrome(editor, "codeBlock");

  const language = (node?.attrs.language as string) ?? "";
  const kind = classifyCodeBlock(language);
  const [editOpen, setEditOpen] = useState(false);

  // native content が読む実行時 CSS 変数を供給する（dark / code フォント）。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--am-editor-dark", isDark ? "1" : "0");
    root.style.setProperty("--am-code-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--am-code-line-height", `${settings.lineHeight}`);
  }, [isDark, settings.fontSize, settings.lineHeight]);

  // 選択駆動の折畳み（展開/再折畳）。
  const prevPosRef = useRef(-1);
  useEffect(() => {
    if (!editor) return;
    if (pos === prevPosRef.current) return;
    const prev = prevPosRef.current;
    prevPosRef.current = pos;
    applySelectionCollapse(editor, prev, pos);
  }, [pos, editor]);

  // native NodeView（ダブルクリック）からの編集意図を購読する。
  useEffect(() => {
    const root = editor?.view?.dom;
    if (!root) return;
    const handler = () => setEditOpen(true);
    root.addEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, handler as EventListener);
    return () => root.removeEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, handler as EventListener);
  }, [editor]);

  // autoEditOpen: スラッシュコマンド作成直後に全画面編集を開く（preview 種別のみ）。
  useEffect(() => {
    if (node?.attrs.autoEditOpen && editor?.isEditable && kind !== "regular") {
      updateAttrs({ autoEditOpen: false });
      setEditOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const handleEdit = useCallback(() => setEditOpen(true), []);

  return (
    <>
      {showToolbar && (
        <BlockChromeAnchor rect={rect}>
          <BlockInlineToolbar
            label={codeBlockToolbarLabel(kind, language, t)}
            onEdit={handleEdit}
            onDelete={() => setDeleteOpen(true)}
            labelDivider
            t={t}
          />
        </BlockChromeAnchor>
      )}

      <DeleteBlockDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDelete={handleDelete}
        t={t}
      />
      {/* S3b: editOpen に応じた種別別の全画面編集ダイアログをここへ追加する。 */}
    </>
  );
}
