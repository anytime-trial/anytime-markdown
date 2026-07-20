/**
 * 思考法ダイアグラム・プリセットの統合エントリ。
 * DSL パーサが生成する `ThinkingDiagramSpec` を受け取り、対応する
 * `GraphDocument`（座標・色つき）を返すディスパッチャを提供する。
 */

import type { GraphDocument } from '../types';
import { buildFishbone, type FishboneSpec } from './fishbone';
import { buildCausalLoop, type CausalLoopSpec } from './causalLoop';
import { buildPyramid, type PyramidSpec } from './pyramid';
import { buildMindmap, type MindmapSpec } from './mindmap';
import { buildDoubleDiamond, type DoubleDiamondSpec } from './doubleDiamond';
import { buildLogicTree, buildWhyChain, type LogicTreeSpec, type WhyChainSpec, type TreeNodeSpec } from './trees';
import { buildSwot, buildMorphBox, buildAffinity, type SwotSpec, type MorphBoxSpec, type AffinitySpec } from './grids';
import { buildStructureMap, type StructureMapSpec } from './structureMap';
import { buildCooccurrence, type CooccurrenceSpec } from './cooccurrence';

export type ThinkingDiagramSpec =
  | FishboneSpec
  | CausalLoopSpec
  | PyramidSpec
  | MindmapSpec
  | DoubleDiamondSpec
  | LogicTreeSpec
  | WhyChainSpec
  | SwotSpec
  | MorphBoxSpec
  | AffinitySpec
  | StructureMapSpec
  | CooccurrenceSpec;

export type ThinkingDiagramType = ThinkingDiagramSpec['type'];

export const THINKING_DIAGRAM_TYPES: readonly ThinkingDiagramType[] = [
  'fishbone',
  'causal-loop',
  'pyramid',
  'mindmap',
  'double-diamond',
  'logic-tree',
  'why-chain',
  'swot',
  'morph-box',
  'affinity',
  'structure-map',
  'cooccurrence',
];

export function buildThinkingDiagram(spec: ThinkingDiagramSpec, isDark: boolean): GraphDocument {
  switch (spec.type) {
    case 'fishbone':
      return buildFishbone(spec, isDark);
    case 'causal-loop':
      return buildCausalLoop(spec, isDark);
    case 'pyramid':
      return buildPyramid(spec, isDark);
    case 'mindmap':
      return buildMindmap(spec, isDark);
    case 'double-diamond':
      return buildDoubleDiamond(spec, isDark);
    case 'logic-tree':
      return buildLogicTree(spec, isDark);
    case 'why-chain':
      return buildWhyChain(spec, isDark);
    case 'swot':
      return buildSwot(spec, isDark);
    case 'morph-box':
      return buildMorphBox(spec, isDark);
    case 'affinity':
      return buildAffinity(spec, isDark);
    case 'structure-map':
      return buildStructureMap(spec, isDark);
    case 'cooccurrence':
      return buildCooccurrence(spec, isDark);
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown thinking diagram type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export type {
  FishboneSpec,
  CausalLoopSpec,
  PyramidSpec,
  MindmapSpec,
  DoubleDiamondSpec,
  LogicTreeSpec,
  WhyChainSpec,
  SwotSpec,
  MorphBoxSpec,
  AffinitySpec,
  StructureMapSpec,
  CooccurrenceSpec,
  TreeNodeSpec,
};
export type { CooccurrenceNode, CooccurrenceLink, CooccurrenceCluster } from './cooccurrence';

// ノート網（ドキュメント関係グラフ）プリセット
export { buildNoteGraph, buildNoteNeighborhood } from './noteGraph';
export type {
  NoteGraphDocInput,
  NoteGraphOptions,
  NoteGraphEdgeLayers,
  NoteNeighborhoodOptions,
  NoteRelatedEntry,
} from './noteGraph';

// 型付きノート関係の語彙・スタイル
export {
  RELATION_TYPES,
  DEFAULT_RELATION_TYPE,
  isRelationType,
  coerceRelationType,
  relationEdgeStyle,
  resolveRelationEdgeStyle,
} from './relationStyle';
export type { RelationType, RelatedRef, RelationEdgeStyle } from './relationStyle';
