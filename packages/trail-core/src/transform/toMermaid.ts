import { c4ToMermaid } from '@anytime-markdown/c4-kernel';
import type { TrailGraph } from '../model/types';
import { trailToC4 } from './toC4';

/** TrailGraph を Mermaid C4 テキストに変換する */
export function toMermaid(graph: TrailGraph): string {
  const model = trailToC4(graph);
  return c4ToMermaid(model);
}
