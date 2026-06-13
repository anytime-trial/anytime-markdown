/**
 * DocEditorModal の vanilla DOM factory。
 *
 * React 版 `components/DocEditorModal.tsx` の DOM 置換。
 * createDialog を利用して backdrop + paper を構築し、textarea 編集状態を closure で管理する。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { createGraphT } from '../i18n/createGraphT';
import {
  createDialog,
  createDialogContent,
  createDialogTitle,
} from '../ui-vanilla/Dialog';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createCloseIcon } from '../ui-vanilla/icons';

export interface DocEditorModalOptions {
  /** ドキュメントタイトル（ヘッダーに表示）。 */
  readonly title: string;
  /** 保存コールバック。モーダルを閉じるときに編集中の content で呼ばれる。 */
  readonly onSave: (content: string) => void;
  /** 閉じるコールバック。 */
  readonly onClose: () => void;
  /** テーマ。既定 'dark'。 */
  readonly themeMode?: 'light' | 'dark';
  /** i18n locale。省略時はブラウザ言語から自動検出。 */
  readonly locale?: string;
}

export interface DocEditorModalHandle {
  /**
   * モーダルを開く。すでに開いている場合は content を上書きする。
   * DOM を document.body へマウントする。
   */
  open(content: string): void;
  /** モーダルを閉じる（onSave を発火してから onClose を呼ぶ）。 */
  close(): void;
  /** リスナーを解放する。open 中なら close() してから解放する。 */
  destroy(): void;
}

/**
 * Doc ノードを全画面 textarea 編集するモーダルを生成する。
 *
 * @returns {@link DocEditorModalHandle}
 */
export function createDocEditorModal(opts: Readonly<DocEditorModalOptions>): DocEditorModalHandle {
  const t = createGraphT('Graph', opts.locale);
  const isDark = (opts.themeMode ?? 'dark') === 'dark';
  const colors = getCanvasColors(isDark);

  // ---- closure 状態 ----
  let editorContent = '';
  let dialogHandle: ReturnType<typeof createDialog> | null = null;
  let textarea: HTMLTextAreaElement | null = null;

  // ---- 閉じる処理 ----
  function doClose(): void {
    if (!dialogHandle) return;
    opts.onSave(editorContent);
    dialogHandle.close();
    dialogHandle = null;
    textarea = null;
    opts.onClose();
  }

  return {
    open(content: string): void {
      // すでに開いている場合は content だけ更新
      if (dialogHandle) {
        editorContent = content;
        if (textarea) textarea.value = content;
        return;
      }

      editorContent = content;

      // ---- ヘッダー ----
      const headerEl = document.createElement('div');
      headerEl.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:8px 16px',
        `border-bottom:1px solid ${colors.panelBorder}`,
        `background-color:${colors.panelBg}`,
      ].join(';');

      const titleText = document.createElement('span');
      titleText.textContent = opts.title || t('untitledDocument');
      titleText.style.cssText = `color:${colors.textPrimary};font-weight:600;font-size:1rem`;
      headerEl.appendChild(titleText);

      const closeBtn = createIconButton({
        size: 'small',
        ariaLabel: 'Close',
        onClick: doClose,
        children: createCloseIcon({ fontSize: 'small' }),
      });
      closeBtn.style.color = colors.textSecondary;
      headerEl.appendChild(closeBtn);

      // ---- textarea ----
      const ta = document.createElement('textarea');
      ta.className = 'gv-doc-textarea';
      ta.value = content;
      ta.placeholder = t('writePlaceholder');
      ta.style.cssText = [
        'width:100%',
        'height:100%',
        'box-sizing:border-box',
        `background-color:${colors.modalBg}`,
        `color:${colors.textPrimary}`,
        'border:none',
        'outline:none',
        'resize:none',
        'padding:24px',
        'font-size:14px',
        'font-family:Roboto Mono,monospace',
        'line-height:1.6',
      ].join(';');
      ta.addEventListener('input', () => {
        editorContent = ta.value;
      });
      textarea = ta;

      // ---- エディタ wrapper ----
      const editorWrapper = document.createElement('div');
      editorWrapper.style.cssText = 'flex:1;overflow:hidden';
      editorWrapper.appendChild(ta);

      // ---- paper 内容 ----
      const paperContent = document.createElement('div');
      paperContent.style.cssText = [
        'margin:auto',
        'width:90vw',
        'max-width:1000px',
        'height:85vh',
        `background-color:${colors.modalBg}`,
        `border:1px solid ${colors.panelBorder}`,
        'border-radius:12px',
        'display:flex',
        'flex-direction:column',
        'overflow:hidden',
      ].join(';');
      paperContent.appendChild(headerEl);
      paperContent.appendChild(editorWrapper);

      // ---- backdrop wrapper ----
      const backdropWrapper = document.createElement('div');
      backdropWrapper.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:1200',
        'display:flex',
        'flex-direction:column',
        'background-color:rgba(0,0,0,0.7)',
        'backdrop-filter:blur(4px)',
      ].join(';');
      backdropWrapper.addEventListener('mousedown', (e) => {
        if (e.target === backdropWrapper) doClose();
      });
      backdropWrapper.appendChild(paperContent);

      // createDialog は backdrop + Escape キー + portal マウントを担う。
      // ここでは自前 backdropWrapper を Dialog の children として渡す代わりに、
      // createDialog の paper に直接 backdropWrapper 全体を入れる構造では重複するため、
      // createDialog を Escape キー専用として使い、el（backdrop）は非表示で添付する。
      // 代わりに自前の backdropWrapper を document.body に直接マウントし、
      // Escape キーは ta の keydown で処理する。
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          doClose();
        }
      });

      document.body.appendChild(backdropWrapper);

      // dialogHandle として最小限の close API を保持する
      dialogHandle = {
        el: backdropWrapper as HTMLDivElement,
        paper: paperContent as HTMLDivElement,
        close() {
          backdropWrapper.remove();
        },
      };
    },

    close(): void {
      doClose();
    },

    destroy(): void {
      doClose();
    },
  };
}
