/**
 * graph-viewer vanilla ContextMenu ファクトリ。
 *
 * React 実装 `components/ContextMenu.tsx` の DOM 版。
 * Menu / MenuItem は ui-core（graphMenu ラッパー経由）、ListItemIcon / ListItemText /
 * Divider は移行中のため ui-vanilla を使用。
 */

import { createMenuItem } from '@anytime-markdown/ui-core/MenuItem';

import { createGraphT } from '../i18n/createGraphT';
import { createGraphMenu, type GraphMenuHandle } from '../ui/graphMenu';
import { listItemIcon } from '../ui/uiCoreAdapters';
import { createDivider } from '../ui-vanilla/Divider';
import { createListItemText } from '../ui-vanilla/ListItemText';
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
  /** メニューのポータル先。`--am-color-*` の届く graph ルート（またはその配下）を渡す。 */
  readonly portalTarget: HTMLElement;
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

  // ui-core MenuItem はハンドル（{ el, update, destroy }）を返す。本メニューは開閉ごとに
  // 使い捨てで update 不要のため el だけ取り出す（listener は el の GC と共に回収される）。
  const menuItem = (o: Parameters<typeof createMenuItem>[0]): HTMLLIElement =>
    createMenuItem(o).el;

  const items: Node[] = [];

  if (targetType === 'node') {
    items.push(
      menuItem({
        onClick: () => handleAction('copy'),
        children: [
          listItemIcon({ children: createContentCopyIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('copy') }),
        ],
      }),
      menuItem({
        onClick: () => handleAction('paste'),
        disabled: !hasClipboard,
        children: [
          listItemIcon({ children: createContentPasteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('paste') }),
        ],
      }),
      menuItem({
        onClick: () => handleAction('delete'),
        children: [
          listItemIcon({ children: createDeleteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('delete') }),
        ],
      }),
      createDivider(),
      menuItem({
        onClick: () => handleAction('bringToFront'),
        children: [
          listItemIcon({ children: createFlipToFrontIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('bringToFront') }),
        ],
      }),
      menuItem({
        onClick: () => handleAction('sendToBack'),
        children: [
          listItemIcon({ children: createFlipToBackIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('sendToBack') }),
        ],
      }),
      createDivider(),
      menuItem({
        onClick: () => handleAction('group'),
        children: [
          listItemIcon({ children: createGroupWorkIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('group') }),
        ],
      }),
      menuItem({
        onClick: () => handleAction('ungroup'),
        children: [
          listItemIcon({ children: createDeblurIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('ungroup') }),
        ],
      }),
    );
  } else if (targetType === 'edge') {
    items.push(
      menuItem({
        onClick: () => handleAction('delete'),
        children: [
          listItemIcon({ children: createDeleteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('delete') }),
        ],
      }),
    );
  } else {
    // canvas
    items.push(
      menuItem({
        onClick: () => handleAction('paste'),
        disabled: !hasClipboard,
        children: [
          listItemIcon({ children: createContentPasteIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('paste') }),
        ],
      }),
      menuItem({
        onClick: () => handleAction('selectAll'),
        children: [
          listItemIcon({ children: createSelectAllIcon({ fontSize: 'small' }) }),
          createListItemText({ children: t('selectAll') }),
        ],
      }),
    );
  }

  const menu: GraphMenuHandle = createGraphMenu({
    anchorReference: 'anchorPosition',
    anchorPosition,
    onClose,
    children: items,
    portalTarget: opts.portalTarget,
  });

  return menu;
}
