import type { Editor } from "@anytime-markdown/markdown-core";

import { GIF_RECORD_INTENT_EVENT } from "../components/GifBlockContent";
import {
  createBlockChromeAnchor,
  createSelectedBlockTracker,
  setBlockAttrs,
} from "./blockChrome";
import {
  ICON,
  createToolbarContainer,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
} from "./vanillaToolbar";

/**
 * gifBlock の編集 chrome を **React なし**で提供する vanilla コントローラ
 * （framework-decoupling Phase 3 / ホスト隔離ゴールの E-first 参照実装）。
 *
 * 選択追従・配置・インラインツールバー（drag-handle / label / edit / delete）を
 * 素 DOM で構成し、編集操作は intent コールバックで host へ委譲する。録画 / 再生 /
 * 削除の各ダイアログ（React・重量 UI）は host（{@link GifDialogHost}）が intent を
 * 受けて表示する。これにより editor + chrome は React-free、React は host へ隔離される。
 *
 * テーマ色は CSS 変数（applyEditorThemeCssVars 注入）で追従するため `useIsDark` 等の
 * React テーマ API に依存しない。
 */

export interface GifBlockChromeCallbacks {
  /** i18n（aria-label 用）。 */
  t: (key: string) => string;
  /** 編集 intent。`src` 有無で host が再生 / 録画を出し分ける。 */
  onEdit: (pos: number, ctx: { src: string; settings: string | null }) => void;
  /** 削除 intent（host が確認ダイアログを表示）。 */
  onDelete: (pos: number) => void;
  /** 録画 intent（placeholder クリック / autoEditOpen / src 無し編集）。 */
  onRecord: (pos: number) => void;
}

/**
 * gifBlock の vanilla chrome を生成する。戻り値は破棄関数。
 */
export function createGifBlockChrome(
  editor: Editor,
  cb: GifBlockChromeCallbacks,
): () => void {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;

  // --- インラインツールバー（素 DOM・共通プリミティブ） ---
  const toolbar = createToolbarContainer("GIF");
  const editBtn = mkIconButton(cb.t("edit"), ICON.edit, () => {
    if (currentPos < 0) return;
    const node = editor.state.doc.nodeAt(currentPos);
    const src = (node?.attrs.src as string) ?? "";
    const settings = (node?.attrs.gifSettings as string) ?? null;
    cb.onEdit(currentPos, { src, settings });
  });
  const deleteBtn = mkIconButton(cb.t("delete"), ICON.delete, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });
  toolbar.append(
    mkDragHandle(cb.t("dragHandle")),
    mkLabel("GIF"),
    editBtn,
    mkSpacer(),
    deleteBtn,
  );
  anchor.el.appendChild(toolbar);

  // --- placeholder クリック（native NodeView 発火）→ 録画 intent ---
  const root = editor.view?.dom;
  const onRecordIntent = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { pos?: number } | undefined;
    const pos = typeof detail?.pos === "number" ? detail.pos : currentPos;
    if (pos >= 0) cb.onRecord(pos);
  };
  root?.addEventListener(GIF_RECORD_INTENT_EVENT, onRecordIntent as EventListener);

  // --- 選択追従（vanilla tracker） ---
  const stop = createSelectedBlockTracker(editor, "gifBlock", ({ pos, node, rect }) => {
    currentPos = pos;
    anchor.setRect(editor.isEditable && pos >= 0 ? rect : null);
    // autoEditOpen: スラッシュコマンド作成直後に録画を開く（属性は即クリア）。
    if (pos >= 0 && node?.attrs?.autoEditOpen && editor.isEditable) {
      setBlockAttrs(editor, pos, { autoEditOpen: false });
      cb.onRecord(pos);
    }
  });

  return () => {
    stop();
    root?.removeEventListener(GIF_RECORD_INTENT_EVENT, onRecordIntent as EventListener);
    anchor.destroy();
  };
}
