/**
 * graph-viewer vanilla ContextMenu ファクトリ。
 *
 * React 実装 `components/ContextMenu.tsx` の DOM 版。
 * createMenu / createMenuItem / createListItemIcon / createListItemText / createDivider を使用。
 */

import { createGraphT } from '../i18n/createGraphT';
import { createDivider } from '../ui-vanilla/Divider';
import { createListItemIcon } from '../ui-vanilla/ListItemIcon';
import { createListItemText } from '../ui-vanilla/ListItemText';
import { createMenu, type MenuHandle } from '../ui-vanilla/Menu';
import { createMenuItem } from '../ui-vanilla/MenuItem';
import {
  createContentCopyIcon,
  createContentPasteIcon,
  createDeblurIcon,
  createDeleteIcon,
  createFlipToBackIcon,
  createFlipToFrontIcon,
  createGroupWorkIcon,
  createSelectAllIcon,
} from '../ui-vanilla/icons';

export type ContextTarget = 'node' | 'edge' | 'canvas';
export type ContextMenuAction =
  | 'copy'
  | 'paste'
  | 'delete'
  | 'bringToFront'
  | 'sendToBack'
  | 'group'
  | 'ungroup'
  | 'selectAll';

export interface ContextMenuOptions {
  readonly anchorPosition: { top: number; left: number };
  readonly targetType: ContextTarget;
  readonly onAction: (action: ContextMenuAction) => void;
  readonly onClose: () => void;
  readonly hasClipboard: boolean;
  readonly locale?: string;
}

export interface ContextMenuHandle {
  readonly el: HTMLDivElement;
  close(): void;
}

/**
 * MUI ContextMenu コンポーネントの vanilla 置換。
 *
 * anchorPosition の絶対座標にポップアップメニューを表示する。
 * targetType に応じてメニュー項目を構築する。
 */
export function createContextMenu(opts: Readonly<ContextMenuOptions>): ContextMenuHandle {
  const { anchorPosition, targetType, onAction, onClose, hasClipboard, locale } = opts;
  const t = createGraphT('Graph', locale);

  const handleAction = (action: ContextMenuAction): void => {
    onAction(action);
    menu.close();
    onClose();
  };

  const items: Node[] = [];

  if (targetType === 'node') {
    items.push(
      createMenuItem({
        onClick: () => handleAction('copy'),
        children: [
          createListItemIcon({ children: createContentCopyIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('copy') }),
        ],
      }),
      createMenuItem({
        onClick: () => handleAction('paste'),
        disabled: !hasClipboard,
        children: [
          createListItemIcon({ children: createContentPasteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('paste') }),
        ],
      }),
      createMenuItem({
        onClick: () => handleAction('delete'),
        children: [
          createListItemIcon({ children: createDeleteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('delete') }),
        ],
      }),
      createDivider(),
      createMenuItem({
        onClick: () => handleAction('bringToFront'),
        children: [
          createListItemIcon({ children: createFlipToFrontIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('bringToFront') }),
        ],
      }),
      createMenuItem({
        onClick: () => handleAction('sendToBack'),
        children: [
          createListItemIcon({ children: createFlipToBackIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('sendToBack') }),
        ],
      }),
      createDivider(),
      createMenuItem({
        onClick: () => handleAction('group'),
        children: [
          createListItemIcon({ children: createGroupWorkIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('group') }),
        ],
      }),
      createMenuItem({
        onClick: () => handleAction('ungroup'),
        children: [
          createListItemIcon({ children: createDeblurIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('ungroup') }),
        ],
      }),
    );
  } else if (targetType === 'edge') {
    items.push(
      createMenuItem({
        onClick: () => handleAction('delete'),
        children: [
          createListItemIcon({ children: createDeleteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('delete') }),
        ],
      }),
    );
  } else {
    // canvas
    items.push(
      createMenuItem({
        onClick: () => handleAction('paste'),
        disabled: !hasClipboard,
        children: [
          createListItemIcon({ children: createContentPasteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('paste') }),
        ],
      }),
      createMenuItem({
        onClick: () => handleAction('selectAll'),
        children: [
          createListItemIcon({ children: createSelectAllIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('selectAll') }),
        ],
      }),
    );
  }

  const menu: MenuHandle = createMenu({
    anchorReference: 'anchorPosition',
    anchorPosition,
    onClose,
    children: items,
  });

  return menu;
}
