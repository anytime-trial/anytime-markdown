/**
 * graph-viewer vanilla DetailPanel ファクトリ。
 *
 * React 版 `components/DetailPanel.tsx` の vanilla 移植。
 * ノードの metadata を読み取り専用で表示する情報パネル。
 *
 * - 右端固定の絶対配置パネル（position:absolute / right:0 / top:0 / bottom:0）。
 * - URL フィールドはクリックで `globalThis.open` を呼ぶ。
 * - metadata エントリは key/value ペアで並べる。
 */

import type { GraphNode } from '../types';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createText } from '../ui-vanilla/Text';
import { createDivider } from '../ui-vanilla/Divider';
import { createCloseIcon } from '../ui-vanilla/icons';

/** DetailPanel handle。destroy() で DOM 除去・イベント解除を行う。 */
export interface DetailPanelHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

export interface CreateDetailPanelOpts {
  readonly node: Readonly<GraphNode>;
  readonly onClose: () => void;
}

/**
 * DetailPanel を生成する。
 *
 * @param opts - 表示対象ノードと閉じるコールバック
 * @returns `DetailPanelHandle`
 */
export function createDetailPanel(opts: Readonly<CreateDetailPanelOpts>): DetailPanelHandle {
  const { node, onClose } = opts;
  const metadata = node.metadata;
  const entries = metadata ? Object.entries(metadata) : [];

  // ---- 外枠コンテナ ----
  const el = document.createElement('div');
  el.className = 'gv-scroll';
  Object.assign(el.style, {
    position: 'absolute',
    right: '0',
    top: '0',
    bottom: '0',
    width: '280px',
    backgroundColor: 'var(--gv-color-bg-paper)',
    borderLeft: '1px solid var(--gv-color-divider)',
    overflowY: 'auto',
    zIndex: '10',
    display: 'flex',
    flexDirection: 'column',
  });

  // ---- ヘッダー ----
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    gap: '8px',
  });

  const titleText = createText({
    variant: 'subtitle2',
    style: {
      flex: '1',
      fontWeight: '600',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    children: node.text ?? '(Untitled)',
  });

  const closeBtn = createIconButton({
    size: 'small',
    ariaLabel: 'Close detail panel',
    children: createCloseIcon({ fontSize: 'small' }),
    onClick: onClose,
  });

  header.appendChild(titleText);
  header.appendChild(closeBtn);
  el.appendChild(header);
  el.appendChild(createDivider());

  // ---- ノード基本情報 ----
  const basicSection = document.createElement('div');
  basicSection.style.padding = '12px';

  basicSection.appendChild(createText({ variant: 'caption', color: 'text.secondary', children: 'Type' }));

  const typeText = createText({
    style: { display: 'block', marginBottom: '8px' },
    children: node.type,
  });
  basicSection.appendChild(typeText);

  if (node.url) {
    basicSection.appendChild(createText({ variant: 'caption', color: 'text.secondary', children: 'URL' }));

    const urlText = createText({
      className: 'gv-link',
      style: {
        display: 'block',
        marginBottom: '8px',
        wordBreak: 'break-all',
        color: 'var(--gv-color-primary-main)',
      },
      children: node.url,
    });
    urlText.addEventListener('click', () => {
      if (node.url) globalThis.open(node.url, '_blank', 'noopener');
    });
    basicSection.appendChild(urlText);
  }

  if (node.label) {
    basicSection.appendChild(createText({ variant: 'caption', color: 'text.secondary', children: 'Label' }));

    const labelText = createText({
      style: { display: 'block', marginBottom: '8px' },
      children: node.label,
    });
    basicSection.appendChild(labelText);
  }

  el.appendChild(basicSection);

  // ---- メタデータ ----
  if (entries.length > 0) {
    el.appendChild(createDivider());

    const metaSection = document.createElement('div');
    metaSection.style.padding = '12px';

    const metaLabel = createText({
      variant: 'caption',
      color: 'text.secondary',
      style: { marginBottom: '4px', display: 'block' },
      children: 'Metadata',
    });
    metaSection.appendChild(metaLabel);

    for (const [key, value] of entries) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
      });

      const keyText = createText({ color: 'text.secondary', children: key });
      const valText = createText({
        style: { fontWeight: '500', fontVariantNumeric: 'tabular-nums' },
        children:
          typeof value === 'number'
            ? (value as number).toLocaleString()
            : String(value),
      });

      row.appendChild(keyText);
      row.appendChild(valText);
      metaSection.appendChild(row);
    }

    el.appendChild(metaSection);
  }

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
