import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import type { AuthorHeatmapEntry } from '@anytime-markdown/trail-core/authorHeatmap';
import { buildSigmaGraph, type CodeGraphCanvasViewProps } from '../codeGraphSigmaGraph';
import {
  buildEditFrequencyColorMap,
  buildLastEditorColorMap,
  frequencyColor,
  noDataColor,
  otherSessionColor,
  selectEmphasizedNodes,
  SESSION_COLORS,
} from '../authorHeatmapColors';
import { communityColor } from '../../components/communityColors';

function node(id: string, community = 0): CodeGraphNode {
  return {
    id,
    label: id,
    repo: 'r',
    package: 'p',
    fileType: 'code',
    community,
    communityLabel: 'c',
    x: 0,
    y: 0,
    size: 1,
  };
}

const graph: CodeGraph = {
  generatedAt: '2026-08-03T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [node('r:a'), node('r:b'), node('r:noData')],
  edges: [],
  communities: { 0: 'c' },
  godNodes: [],
};

function entry(nodeId: string, sessionId: string, commitCount: number, topSessionShare: number): AuthorHeatmapEntry {
  return {
    nodeId,
    lastEditorSessionId: sessionId,
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    commitCount,
    sessionCount: 1,
    topSessionShare,
  };
}

const entries: AuthorHeatmapEntry[] = [
  entry('r:a', 's1', 1, 1.0),
  entry('r:b', 's2', 12, 0.4),
];

const colorOf = (props: CodeGraphCanvasViewProps, id: string): string =>
  buildSigmaGraph(props).g.getNodeAttribute(id, 'color') as string;

describe('codeGraphCanvas: Author Heatmap 配色', () => {
  const base: CodeGraphCanvasViewProps = { graph, isDark: true };

  it('colorBy=community では従来どおりコミュニティ色（回帰）', () => {
    expect(colorOf(base, 'r:a')).toBe(communityColor(0));
  });

  describe('colorBy=lastEditor', () => {
    const props: CodeGraphCanvasViewProps = {
      ...base,
      colorBy: 'lastEditor',
      nodeColorOverrides: buildLastEditorColorMap(entries, ['s1', 's2'], true),
      emphasizedNodes: selectEmphasizedNodes(entries),
      neutralColor: noDataColor(true),
    };

    it('上位セッションのノードに固有色を割り当てる', () => {
      expect(colorOf(props, 'r:a')).toBe(SESSION_COLORS[0]);
      expect(colorOf(props, 'r:b')).toBe(SESSION_COLORS[1]);
    });

    it('集計に無いノードは中立色のまま残る（低頻度と混同しない）', () => {
      expect(colorOf(props, 'r:noData')).toBe(noDataColor(true));
    });

    it('上位に入らないセッションは「その他」色へまとまる', () => {
      const p = { ...props, nodeColorOverrides: buildLastEditorColorMap(entries, ['s1'], true) };
      expect(colorOf(p, 'r:b')).toBe(otherSessionColor(true));
    });

    it('属人度の高いノードを色以外の手段（highlighted）でも識別できる', () => {
      const { g } = buildSigmaGraph(props);
      expect(g.getNodeAttribute('r:a', 'highlighted')).toBe(true);
      expect(g.getNodeAttribute('r:b', 'highlighted')).toBeUndefined();
    });

    it('確定色を baseColor に控える（検索ハイライトの復帰で上書きが消えない）', () => {
      const { g } = buildSigmaGraph(props);
      expect(g.getNodeAttribute('r:a', 'baseColor')).toBe(SESSION_COLORS[0]);
      expect(g.getNodeAttribute('r:noData', 'baseColor')).toBe(noDataColor(true));
    });

    it('パレット数を超えるセッションは同色にせず「その他」へ落とす', () => {
      // サーバーは topSessions を最大 32 まで返し得るが、パレットは 8 色しかない。
      // 剰余で循環させると 9 番目が 1 番目と同色になり「同じ編集者」と誤読される。
      const many = Array.from({ length: 12 }, (_, i) => `s${i}`);
      const manyEntries = many.map((s, i) => entry(`r:n${i}`, s, 1, 1));
      const map = buildLastEditorColorMap(manyEntries, many, true);
      expect(map.get('r:n0')).toBe(SESSION_COLORS[0]);
      expect(map.get('r:n7')).toBe(SESSION_COLORS[7]);
      expect(map.get('r:n8')).toBe(otherSessionColor(true));
      expect(map.get('r:n11')).toBe(otherSessionColor(true));
      const unique = new Set([...map.values()].filter((c) => c !== otherSessionColor(true)));
      expect(unique.size).toBe(SESSION_COLORS.length);
    });

    it('ダークとライトで中立色・その他色が切り替わる', () => {
      expect(noDataColor(true)).not.toBe(noDataColor(false));
      expect(otherSessionColor(true)).not.toBe(otherSessionColor(false));
    });
  });

  describe('colorBy=editFrequency', () => {
    const props: CodeGraphCanvasViewProps = {
      ...base,
      colorBy: 'editFrequency',
      nodeColorOverrides: buildEditFrequencyColorMap(entries, true),
      neutralColor: noDataColor(true),
    };

    it('コミット数の段階で着色する（1〜2 は低・9 以上は高）', () => {
      expect(colorOf(props, 'r:a')).toBe(frequencyColor('low', true));
      expect(colorOf(props, 'r:b')).toBe(frequencyColor('high', true));
    });

    it('集計に無いノードは中立色', () => {
      expect(colorOf(props, 'r:noData')).toBe(noDataColor(true));
    });

    it('輪郭強調は行わない（属人度ではなく頻度を表す配色のため）', () => {
      const { g } = buildSigmaGraph(props);
      expect(g.getNodeAttribute('r:a', 'highlighted')).toBeUndefined();
    });
  });

  it('override は colorBy が community のときには適用されない', () => {
    const props: CodeGraphCanvasViewProps = {
      ...base,
      colorBy: 'community',
      nodeColorOverrides: buildLastEditorColorMap(entries, ['s1', 's2'], true),
    };
    expect(colorOf(props, 'r:a')).toBe(communityColor(0));
  });

  it('override 配色で対応表が無くても全ノードが中立色で描ける（取得失敗時の縮退）', () => {
    const props: CodeGraphCanvasViewProps = {
      ...base,
      colorBy: 'lastEditor',
      nodeColorOverrides: null,
      neutralColor: noDataColor(true),
    };
    for (const id of ['r:a', 'r:b', 'r:noData']) {
      expect(colorOf(props, id)).toBe(noDataColor(true));
    }
  });
});
