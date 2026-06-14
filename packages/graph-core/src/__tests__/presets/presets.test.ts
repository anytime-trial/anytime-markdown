import { buildThinkingDiagram, type ThinkingDiagramSpec } from '../../presets/index';
import { exportToSvg } from '../../io/exportSvg';

describe('buildThinkingDiagram', () => {
  it('fishbone: 頭＋カテゴリ数のノードと背骨＋骨のエッジ', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'fishbone',
        problem: '不良率が高い',
        categories: [
          { label: '人', causes: ['教育不足', '経験不足'] },
          { label: '機械', causes: ['老朽化'] },
          { label: '方法', causes: [] },
        ],
      },
      true,
    );
    // head + 3 categories
    expect(doc.nodes).toHaveLength(4);
    expect(doc.nodes.find((n) => n.id === 'head')!.text).toBe('不良率が高い');
    // spine + 3 bones
    expect(doc.edges).toHaveLength(4);
    expect(doc.nodes.find((n) => n.id === 'cat-0')!.text).toContain('・教育不足');
  });

  it('causal-loop: リンク端点から重複なくノード化し、極性をラベル化', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'causal-loop',
        links: [
          { from: '在庫', to: '出荷', polarity: '+' },
          { from: '出荷', to: '在庫', polarity: '-' },
        ],
      },
      false,
    );
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges.map((e) => e.label)).toEqual(['+', '-']);
  });

  it('pyramid: tier 数のノード・上段ほど幅が狭い', () => {
    const doc = buildThinkingDiagram(
      { type: 'pyramid', tiers: [{ label: '理念' }, { label: '戦略' }, { label: '戦術' }] },
      true,
    );
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes[0].width).toBeLessThan(doc.nodes[2].width);
  });

  it('mindmap: 中心＋ブランチ＋子のノード', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'mindmap',
        root: '新規事業',
        branches: [
          { label: '市場', children: [{ label: 'B2B' }, { label: 'B2C' }] },
          { label: '技術' },
        ],
      },
      true,
    );
    // center + 2 branches + 2 children
    expect(doc.nodes).toHaveLength(5);
  });

  it('double-diamond: 2ダイヤ＋4見出し＋4項目', () => {
    const doc = buildThinkingDiagram(
      { type: 'double-diamond', discover: ['観察'], define: ['課題定義'], develop: ['アイデア'], deliver: ['検証'] },
      false,
    );
    // 2 diamonds + 4 headers + 4 item boxes
    expect(doc.nodes).toHaveLength(10);
    expect(doc.nodes.filter((n) => n.type === 'diamond')).toHaveLength(2);
  });

  it('logic-tree: 全ノードに座標、ルートは深さ0', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'logic-tree',
        root: '売上を上げる',
        children: [
          { label: '客数', children: [{ label: '新規' }, { label: '既存' }] },
          { label: '客単価' },
        ],
      },
      true,
    );
    expect(doc.nodes).toHaveLength(5);
    // root at x=0
    expect(doc.nodes[0].x).toBe(0);
  });

  it('why-chain: 問題＋ステップ、エッジは n-1 本', () => {
    const doc = buildThinkingDiagram(
      { type: 'why-chain', problem: '遅延', steps: ['人手不足', '採用難'] },
      true,
    );
    expect(doc.nodes).toHaveLength(3);
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges[0].label).toBe('なぜ?');
  });

  it('swot: 4象限', () => {
    const doc = buildThinkingDiagram(
      { type: 'swot', strengths: ['技術'], weaknesses: ['規模'], opportunities: ['市場成長'], threats: ['競合'] },
      false,
    );
    expect(doc.nodes).toHaveLength(4);
  });

  it('morph-box: パラメータ見出し＋選択肢セル', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'morph-box',
        parameters: [
          { label: '動力', options: ['電気', 'ガソリン'] },
          { label: '素材', options: ['金属', '樹脂', '木材'] },
        ],
      },
      true,
    );
    // 2 params + (2 + 3) options
    expect(doc.nodes).toHaveLength(7);
  });

  it('affinity: グループ見出し＋付箋', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'affinity',
        groups: [
          { label: 'UX', notes: ['遅い', '迷う'] },
          { label: '価格', notes: ['高い'] },
        ],
      },
      true,
    );
    // 2 groups + 3 notes
    expect(doc.nodes).toHaveLength(5);
    expect(doc.nodes.filter((n) => n.type === 'sticky')).toHaveLength(3);
  });
});

describe('exportToSvg 全図種スモーク（ダーク/ライト・透過背景）', () => {
  const specs: ThinkingDiagramSpec[] = [
    { type: 'fishbone', problem: 'P', categories: [{ label: 'A', causes: ['x'] }] },
    { type: 'causal-loop', links: [{ from: 'a', to: 'b', polarity: '+' }] },
    { type: 'pyramid', tiers: [{ label: 'top' }, { label: 'bottom' }] },
    { type: 'mindmap', root: 'R', branches: [{ label: 'b1' }] },
    { type: 'double-diamond', discover: ['d'], define: [], develop: [], deliver: [] },
    { type: 'logic-tree', root: 'r', children: [{ label: 'c' }] },
    { type: 'why-chain', problem: 'p', steps: ['s'] },
    { type: 'swot', strengths: ['s'], weaknesses: [], opportunities: [], threats: [] },
    { type: 'morph-box', parameters: [{ label: 'p', options: ['o'] }] },
    { type: 'affinity', groups: [{ label: 'g', notes: ['n'] }] },
  ];

  for (const spec of specs) {
    for (const isDark of [true, false]) {
      it(`${spec.type} (${isDark ? 'dark' : 'light'}) は有効な SVG を返す`, () => {
        const doc = buildThinkingDiagram(spec, isDark);
        const svg = exportToSvg(doc, { background: 'transparent', textColor: isDark ? '#fff' : '#1F1E1C' });
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        // 透過背景なので背景 rect は出力されない
        expect(svg).not.toContain(`fill="#0D1117"`);
        expect(svg).not.toContain('NaN');
      });
    }
  }
});
