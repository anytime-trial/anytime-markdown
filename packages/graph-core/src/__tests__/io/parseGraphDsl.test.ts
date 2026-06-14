import { parseGraphDsl, GraphDslError } from '../../io/parseGraphDsl';
import { renderThinkingDiagramSvg } from '../../io/renderThinkingDiagram';

describe('parseGraphDsl', () => {
  it('fishbone を解析する', () => {
    const spec = parseGraphDsl(
      ['type: fishbone', 'problem: 不良率が高い', '- 人: 教育不足, 経験不足', '- 機械: 老朽化', '- 方法:'].join('\n'),
    );
    expect(spec).toEqual({
      type: 'fishbone',
      problem: '不良率が高い',
      categories: [
        { label: '人', causes: ['教育不足', '経験不足'] },
        { label: '機械', causes: ['老朽化'] },
        { label: '方法', causes: [] },
      ],
    });
  });

  it('全角コロン・全角読点も区切りとして解釈する', () => {
    const spec = parseGraphDsl(['type：fishbone', 'problem：A', '- 人：x、y'].join('\n'));
    expect(spec.type).toBe('fishbone');
    if (spec.type === 'fishbone') {
      expect(spec.categories[0]).toEqual({ label: '人', causes: ['x', 'y'] });
    }
  });

  it('causal-loop の極性を解析する（+/- と全角）', () => {
    const spec = parseGraphDsl(
      ['type: causal-loop', 'title: 在庫', '在庫 -> 出荷: +', '出荷 -> 在庫: -', '需要 -> 在庫 ＋'].join('\n'),
    );
    expect(spec.type).toBe('causal-loop');
    if (spec.type === 'causal-loop') {
      expect(spec.links).toEqual([
        { from: '在庫', to: '出荷', polarity: '+' },
        { from: '出荷', to: '在庫', polarity: '-' },
        { from: '需要', to: '在庫', polarity: '+' },
      ]);
    }
  });

  it('mindmap のインデントツリーを解析する', () => {
    const spec = parseGraphDsl(
      ['type: mindmap', 'root: 新規事業', '- 市場', '  - B2B', '  - B2C', '- 技術'].join('\n'),
    );
    expect(spec.type).toBe('mindmap');
    if (spec.type === 'mindmap') {
      expect(spec.root).toBe('新規事業');
      expect(spec.branches).toHaveLength(2);
      expect(spec.branches[0].children?.map((c) => c.label)).toEqual(['B2B', 'B2C']);
      expect(spec.branches[1].children).toBeUndefined();
    }
  });

  it('logic-tree の3階層インデントを解析する', () => {
    const spec = parseGraphDsl(
      ['type: logic-tree', 'root: 売上', '- 客数', '  - 新規', '    - 広告', '  - 既存', '- 客単価'].join('\n'),
    );
    if (spec.type === 'logic-tree') {
      expect(spec.children[0].children?.[0].children?.[0].label).toBe('広告');
    }
  });

  it('swot / double-diamond のヘッダ配列を解析する', () => {
    const swot = parseGraphDsl(['type: swot', 'strengths: 技術, ブランド', 'threats: 競合'].join('\n'));
    if (swot.type === 'swot') {
      expect(swot.strengths).toEqual(['技術', 'ブランド']);
      expect(swot.weaknesses).toEqual([]);
      expect(swot.threats).toEqual(['競合']);
    }
    const dd = parseGraphDsl(['type: double-diamond', 'discover: 観察', 'deliver: 検証, 公開'].join('\n'));
    if (dd.type === 'double-diamond') {
      expect(dd.discover).toEqual(['観察']);
      expect(dd.deliver).toEqual(['検証', '公開']);
    }
  });

  it('エイリアス（cld, kj, 5why, issue-tree）を正規化する', () => {
    expect(parseGraphDsl(['type: cld', 'a -> b: +'].join('\n')).type).toBe('causal-loop');
    expect(parseGraphDsl(['type: kj', '- g: n'].join('\n')).type).toBe('affinity');
    expect(parseGraphDsl(['type: 5why', 'problem: p', '- s'].join('\n')).type).toBe('why-chain');
    expect(parseGraphDsl(['type: issue-tree', 'root: r', '- c'].join('\n')).type).toBe('logic-tree');
  });

  describe('エラー（silent catch 禁止・明示エラー）', () => {
    it('空入力', () => {
      expect(() => parseGraphDsl('   ')).toThrow(GraphDslError);
    });
    it('type 行なし', () => {
      expect(() => parseGraphDsl('problem: x\n- a: b')).toThrow(/type:/);
    });
    it('未知の図種', () => {
      expect(() => parseGraphDsl('type: hexagon')).toThrow(/未知の図種/);
    });
    it('fishbone で problem 欠落', () => {
      expect(() => parseGraphDsl('type: fishbone\n- 人: x')).toThrow(/problem/);
    });
    it('fishbone でカテゴリ欠落', () => {
      expect(() => parseGraphDsl('type: fishbone\nproblem: x')).toThrow(/カテゴリ/);
    });
    it('causal-loop の不正なリンク行', () => {
      expect(() => parseGraphDsl('type: causal-loop\n在庫 -> 出荷')).toThrow(/リンク/);
    });
    it('mindmap で root 欠落', () => {
      expect(() => parseGraphDsl('type: mindmap\n- a')).toThrow(/root/);
    });
  });
});

describe('renderThinkingDiagramSvg', () => {
  it('DSL から透過背景の SVG を返す', () => {
    const svg = renderThinkingDiagramSvg('type: pyramid\n- 理念\n- 戦略\n- 戦術', true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('理念');
    expect(svg).not.toContain('NaN');
  });

  it('不正 DSL は GraphDslError を投げる', () => {
    expect(() => renderThinkingDiagramSvg('type: fishbone', true)).toThrow(GraphDslError);
  });
});
