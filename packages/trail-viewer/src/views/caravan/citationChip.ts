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
export function createCitationChip(props: CitationChipProps): { el: HTMLElement; destroy: () => void } {
  const label = props.title ?? props.tag;
  const chip = createChip({
    size: 'small',
    label,
    onClick: props.onClick ? () => props.onClick!(props.tag) : undefined,
  });
  const { el } = chip;
  // 旧 sx ml/mr:0.5 = 4px（SPACING_UNIT=8）。2px は換算ミスだったため 4px に戻す。
  el.style.marginLeft = '4px';
  el.style.marginRight = '4px';
  el.style.cursor = props.onClick ? 'pointer' : 'default';

  // tooltip は document.body 直下に付くため、chip 破棄時に必ず destroy して浮遊残置を防ぐ
  // （chatPane が replaceChildren で再構築する際に open 中の tooltip が孤児化する回帰の修正）。
  const tooltip = createTooltip({ reference: el, title: props.summary ?? props.tag });

  return {
    el,
    destroy: () => {
      tooltip.destroy();
      chip.destroy();
    },
  };
}
