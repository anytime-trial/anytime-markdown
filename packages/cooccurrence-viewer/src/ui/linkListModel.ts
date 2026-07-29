import { LINK_DIRECTION, readLink, type CooccurrenceLinkTuple, type LinkDirection } from '@anytime-markdown/graph-core';

export interface LinkRow {
  /** `spec.links` の添字。編集関数へ渡すため、表示順ではなく元の添字を保つ。 */
  linkIndex: number;
  sourceLabel: string;
  targetLabel: string;
  strength: number;
  direction: LinkDirection;
}

const SYMBOL: Record<LinkDirection, string> = {
  [LINK_DIRECTION.none]: '—',
  [LINK_DIRECTION.forward]: '→',
  [LINK_DIRECTION.backward]: '←',
  [LINK_DIRECTION.both]: '↔',
};

/**
 * 一覧に出す向きの記号（設計書 §3.3）。
 *
 * Why not 翻訳辞書へ置くか: 4 つの記号は言語によらず同じ図形であり、辞書に置くと ja/en で
 * 別々に書き換えられる余地が生じる。矢印の向きは意味そのものなので、揺らぐ余地を作らない。
 */
export function directionSymbol(direction: LinkDirection): string {
  return SYMBOL[direction] ?? SYMBOL[LINK_DIRECTION.none];
}

/**
 * 共起の一覧行を作り、検索語で絞る。検索は両端の語名に対する部分一致（設計書 §3.3）。
 *
 * Why not 絞り込み（設計書 §3.2）の結果で行を減らすか: 一覧は編集対象を選ぶ面であり、図で
 * 隠れている共起も編集できる必要がある。隠れていることは行の印で示し、一覧からは外さない。
 */
export function filterLinkRows(
  nodes: readonly { label: string }[],
  links: readonly CooccurrenceLinkTuple[],
  query: string,
): LinkRow[] {
  const needle = query.trim();
  const rows: LinkRow[] = [];
  links.forEach((link, linkIndex) => {
    const view = readLink(link);
    const sourceLabel = nodes[view.source]?.label ?? '';
    const targetLabel = nodes[view.target]?.label ?? '';
    if (needle !== '' && !sourceLabel.includes(needle) && !targetLabel.includes(needle)) return;
    rows.push({ linkIndex, sourceLabel, targetLabel, strength: view.strength, direction: view.direction });
  });
  return rows;
}
