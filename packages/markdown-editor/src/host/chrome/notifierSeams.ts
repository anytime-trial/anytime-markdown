import type { Editor } from "@anytime-markdown/markdown-core";

import type { HeadingItem } from "../../types";
import { type CommentInfo, installCommentNotifications } from "../../utils/commentNotifications";
import { installFrontmatterStorage, installHeadingsNotifier } from "../vanillaPageSeams";

/**
 * ホストへの通知 seam（見出し / コメント / frontmatter storage）の設置。
 *
 * 3 つとも「ホストがコールバックを渡していれば購読を張る」という同じ形で、張った購読は
 * すべて disposer で返す。frontmatter だけは storage 経由の入口（スラッシュコマンドからの
 * 展開 + フォーカス）を追加で生やすため、ここに同居させている。
 */

export type Disposer = () => void;

export interface NotifierSeamsOptions {
  readonly editor: Editor;
  /** editor.storage。frontmatter storage へ focusEditor を生やすために触る。 */
  readonly editorStorage: Record<string, unknown>;
  /**
   * 購読を張るかどうかの判定（設置時点のホスト指定）。通知そのものは下の notify* を使う
   * — ホストは live update で `current` を差し替えるため、呼び出しは都度解決する必要がある。
   */
  readonly hasHeadingsListener: boolean;
  readonly hasCommentsListener: boolean;
  readonly notifyHeadings: (headings: HeadingItem[]) => void;
  readonly notifyComments: (comments: CommentInfo[]) => void;
  readonly getFrontmatter: () => string | null;
  readonly setFrontmatter: (value: string | null, options?: { autoExpand?: boolean }) => void;
  /** /frontmatter コマンドから呼ぶ「折りたたみを展開してフォーカス」。 */
  readonly focusFrontmatter: () => void;
}

/** 通知 seam を設置し、解除関数の配列を返す。 */
export function installNotifierSeams(options: NotifierSeamsOptions): Disposer[] {
  const {
    editor,
    editorStorage,
    hasHeadingsListener,
    hasCommentsListener,
    notifyHeadings,
    notifyComments,
    getFrontmatter,
    setFrontmatter,
    focusFrontmatter,
  } = options;

  const disposers: Disposer[] = [];

  if (hasHeadingsListener) {
    disposers.push(installHeadingsNotifier(editor, notifyHeadings));
  }
  if (hasCommentsListener) {
    disposers.push(installCommentNotifications(editor, notifyComments));
  }
  disposers.push(installFrontmatterStorage(editor, getFrontmatter, setFrontmatter));

  // スラッシュコマンド（/frontmatter）が折りたたみ状態でも展開してフォーカスできるよう、
  // storage.frontmatter に focusEditor を生やす（installFrontmatterStorage の get/set に追加）。
  const fmStorage = editorStorage.frontmatter as { focusEditor?: () => void } | undefined;
  if (fmStorage) fmStorage.focusEditor = focusFrontmatter;

  return disposers;
}
