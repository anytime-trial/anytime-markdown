import { LINK_DIRECTION, type LinkDirection } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';

/**
 * MCP の入出力で使う向きの名前。
 *
 * Why not `.cooc.json` の数値コードをそのまま受け渡すか: 呼び出し側（Claude Code）にファイル
 * 内部の表現を知らせると、表現を変えるたびに呼び出し側が追随することになる。端点を語名で
 * 受ける方針と同じ理由による（設計書 §5）。
 */
export type CooccurrenceDirectionName = 'none' | 'forward' | 'backward' | 'both';

export const DIRECTION_BY_NAME: Record<CooccurrenceDirectionName, LinkDirection> = {
  none: LINK_DIRECTION.none,
  forward: LINK_DIRECTION.forward,
  backward: LINK_DIRECTION.backward,
  both: LINK_DIRECTION.both,
};

const NAME_BY_DIRECTION: Record<LinkDirection, CooccurrenceDirectionName> = {
  [LINK_DIRECTION.none]: 'none',
  [LINK_DIRECTION.forward]: 'forward',
  [LINK_DIRECTION.backward]: 'backward',
  [LINK_DIRECTION.both]: 'both',
};

export function directionNameOf(direction: LinkDirection): CooccurrenceDirectionName {
  return NAME_BY_DIRECTION[direction] ?? 'none';
}
