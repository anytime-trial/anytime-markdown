import type { C4Model } from '../../types';
import type { CommunityOverlayEntry } from '../../computeCommunityOverlay';
import { buildCommunityTree } from '../buildCommunityTree';

function makeOverlayEntry(dominantCommunity: number): CommunityOverlayEntry {
  return {
    elementId: '',
    dominantCommunity,
    dominantRatio: 1,
    breakdown: [{ community: dominantCommunity, count: 1 }],
    isGodNode: false,
  };
}

describe('buildCommunityTree', () => {
  it('コミュニティオーバーレイが空のとき空配列を返す', () => {
    const model: C4Model = { level: 'component', elements: [], relationships: [] };
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: new Map(),
      communities: {},
    });
    expect(result).toEqual([]);
  });

  it('単一コミュニティ・単一コンポーネント・親コンテナなしの場合', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'comp1', type: 'component', name: 'ComponentA' },
      ],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['comp1', makeOverlayEntry(0)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 0: 'Group A' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('community:0');
    expect(result[0].name).toBe('Group A');
    expect(result[0].type).toBe('community');
    expect(result[0].communityId).toBe(0);
    expect(result[0].nodeCount).toBe(1);
    // コンポーネントが子として含まれる
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('comp1');
    expect(result[0].children[0].name).toBe('ComponentA');
  });

  it('コンポーネントがコンテナ境界内にある場合、コンテナノードでラップされる', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'cont1', type: 'container', name: 'ContainerX' },
        { id: 'comp1', type: 'component', name: 'ComponentA', boundaryId: 'cont1' },
      ],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['comp1', makeOverlayEntry(1)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 1: 'Group B' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('community:1');
    expect(result[0].children).toHaveLength(1);
    // コンテナノードでラップされている
    const containerNode = result[0].children[0];
    expect(containerNode.id).toBe('cont1');
    expect(containerNode.name).toBe('ContainerX');
    expect(containerNode.children).toHaveLength(1);
    expect(containerNode.children[0].id).toBe('comp1');
  });

  it('maxDepth="container" のとき component以下の子ノードを含まない', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'cont1', type: 'container', name: 'ContainerX' },
        { id: 'comp1', type: 'component', name: 'ComponentA', boundaryId: 'cont1' },
      ],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['comp1', makeOverlayEntry(0)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 0: 'G' },
      maxDepth: 'container',
    });
    // コンテナノードの children は空
    const containerNode = result[0].children[0];
    expect(containerNode.id).toBe('cont1');
    expect(containerNode.children).toEqual([]);
  });

  it('maxDepth="code" のとき code 子要素が含まれる', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'comp1', type: 'component', name: 'CompA' },
        { id: 'code1', type: 'code', name: 'fileA.ts', boundaryId: 'comp1' },
        { id: 'code2', type: 'code', name: 'fileB.ts', boundaryId: 'comp1' },
      ],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['comp1', makeOverlayEntry(0)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 0: 'G' },
      maxDepth: 'code',
    });
    const compNode = result[0].children[0];
    expect(compNode.id).toBe('comp1');
    // code children are sorted by name
    expect(compNode.children).toHaveLength(2);
    expect(compNode.children[0].id).toBe('code1');
    expect(compNode.children[1].id).toBe('code2');
  });

  it('複数コミュニティが communityId 昇順で返る', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'compA', type: 'component', name: 'A' },
        { id: 'compB', type: 'component', name: 'B' },
      ],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['compA', makeOverlayEntry(2)],
      ['compB', makeOverlayEntry(0)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 0: 'First', 2: 'Third' },
    });
    expect(result).toHaveLength(2);
    expect(result[0].communityId).toBe(0);
    expect(result[1].communityId).toBe(2);
  });

  it('communitySummaries の name が communities より優先される', () => {
    const model: C4Model = {
      level: 'component',
      elements: [{ id: 'comp1', type: 'component', name: 'C' }],
      relationships: [],
    };
    const overlay = new Map<string, CommunityOverlayEntry>([
      ['comp1', makeOverlayEntry(0)],
    ]);
    const result = buildCommunityTree({
      c4Model: model,
      communityOverlay: overlay,
      communities: { 0: 'fallback' },
      communitySummaries: { 0: { name: 'SummaryName', summary: 'desc' } },
    });
    expect(result[0].name).toBe('SummaryName');
    expect(result[0].description).toBe('desc');
  });
});
