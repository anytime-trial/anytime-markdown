import type { Editor } from "@anytime-markdown/markdown-core";

import { createCommentPanel } from "../../components-vanilla/CommentPanel";
import { createOutlinePanel } from "../../components-vanilla/OutlinePanel";
import type { SectionLockUiEntry } from "../../extensions/sectionLockPlugin";
import type { TranslationFn } from "../../types";

/**
 * サイドバーパネル（Outline / Comment / ノート網）の toggle マウント。
 *
 * 3 つとも「開いていて未マウントなら作る / 閉じていてマウント済みなら壊す」という
 * 同じ形をしているが、後始末の単位が違う（Outline / Comment は自前の destroy、
 * ノート網はホスト所有 element の取り外し + コールバック通知）。開閉状態は
 * `modeState` が持ち、本モジュールは「現在の状態へ DOM を合わせる」責務だけを負う。
 */

const OUTLINE_WIDTH = 240;

/** ホストが所有するノート網スロット（中身には関知しない）。 */
export interface NoteGraphSlot {
  element: HTMLElement;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface SidebarPanelsOptions {
  readonly editor: Editor;
  readonly t: TranslationFn;
  readonly sidebarSlot: HTMLElement;
  /** OutlinePanel の高さ算出に使うスクロールコンテナ。 */
  readonly contentEl: HTMLElement;
  readonly isOutlineOpen: () => boolean;
  readonly isCommentOpen: () => boolean;
  readonly isNoteGraphOpen: () => boolean;
  /** ノート網スロットは live prop のため getter で受ける（未指定なら何もしない）。 */
  readonly noteGraphSlot: () => NoteGraphSlot | undefined;
  readonly getSectionLocks: () => SectionLockUiEntry[];
  readonly onToggleSectionLock: (headingIndex: number) => void;
  readonly canToggleSectionLock: () => boolean;
}

export interface SidebarPanelsController {
  syncOutline: () => void;
  syncComment: () => void;
  syncNoteGraph: () => void;
  dispose: () => void;
}

export function installSidebarPanels(options: SidebarPanelsOptions): SidebarPanelsController {
  const {
    editor, t, sidebarSlot, contentEl,
    isOutlineOpen, isCommentOpen, isNoteGraphOpen, noteGraphSlot,
    getSectionLocks, onToggleSectionLock, canToggleSectionLock,
  } = options;

  let outlinePanel: { el: HTMLElement; destroy: () => void } | null = null;
  let commentPanel: { el: HTMLElement; destroy: () => void } | null = null;
  let noteGraphMounted = false;

  const syncOutline = (): void => {
    if (isOutlineOpen() && !outlinePanel) {
      outlinePanel = createOutlinePanel({
        editor,
        t,
        outlineWidth: OUTLINE_WIDTH,
        editorHeight: contentEl.clientHeight || 600,
        onOutlineClick: (pos) => editor.chain().focus().setTextSelection(pos).run(),
        hideResize: true,
        getSectionLocks,
        onToggleSectionLock,
        canToggleSectionLock,
      });
      sidebarSlot.appendChild(outlinePanel.el);
    } else if (!isOutlineOpen() && outlinePanel) {
      outlinePanel.destroy();
      outlinePanel.el.remove();
      outlinePanel = null;
    }
  };

  const syncComment = (): void => {
    if (isCommentOpen() && !commentPanel) {
      commentPanel = createCommentPanel({ editor, t });
      sidebarSlot.appendChild(commentPanel.el);
    } else if (!isCommentOpen() && commentPanel) {
      commentPanel.destroy();
      commentPanel.el.remove();
      commentPanel = null;
    }
  };

  const syncNoteGraph = (): void => {
    const slot = noteGraphSlot();
    if (!slot) return;
    if (isNoteGraphOpen() && !noteGraphMounted) {
      sidebarSlot.appendChild(slot.element);
      noteGraphMounted = true;
      slot.onOpen?.();
    } else if (!isNoteGraphOpen() && noteGraphMounted) {
      slot.element.remove();
      noteGraphMounted = false;
      slot.onClose?.();
    }
  };

  const dispose = (): void => {
    outlinePanel?.destroy();
    commentPanel?.destroy();
    if (noteGraphMounted) {
      const slot = noteGraphSlot();
      slot?.element.remove();
      slot?.onClose?.();
    }
  };

  return { syncOutline, syncComment, syncNoteGraph, dispose };
}
