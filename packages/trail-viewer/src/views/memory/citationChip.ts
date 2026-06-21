/**
 * CitationChip の vanilla DOM 版。
 * citation タグ ([^entity:xxx] 等) をインライン Chip で表示し、クリックコールバックを呼ぶ。
 */
import { createChip, createTooltip } from '@anytime-markdown/ui-core';

export interface CitationChipProps {
  readonly tag: string; // e.g. "entity:abc123"
  readonly title?: string;
  readonly summary?: string;
  readonly onClick?: (tag: string) => void;
}

/**
 * Chip 要素を生成して返す（`el` プロパティ）。
 * 更新が必要な場合は呼び出し側が置換する（シンプルな葉ノードのため handle なし）。
 */
export function createCitationChip(props: CitationChipProps): { el: HTMLElement } {
  const label = props.title ?? props.tag;
  const { el } = createChip({
    size: 'small',
    label,
    onClick: props.onClick ? () => props.onClick!(props.tag) : undefined,
  });
  el.style.marginLeft = '2px';
  el.style.marginRight = '2px';
  el.style.cursor = props.onClick ? 'pointer' : 'default';

  createTooltip({ reference: el, title: props.summary ?? props.tag });

  return { el };
}
