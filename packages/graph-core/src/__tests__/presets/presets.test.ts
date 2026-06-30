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
    // 極性エッジは links.N.polarity の metadata を持ち、SVG に data-metadata として出力される（インライン編集対象）
    expect(doc.edges.map((e) => e.metadata?.path)).toEqual(['links.0.polarity', 'links.1.polarity']);
    const svg = exportToSvg(doc, { background: 'transparent', textColor: '#fff' });
    // 編集欄肥大化を避けるため、data-metadata はエッジ <g> ではなくラベル <text> に乗る
    expect(svg).toMatch(/<text[^>]*data-metadata="[^"]*links\.0\.polarity/);
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

  it('mindmap(FreeMind): 兄弟の子ノードが重ならない（縦積み）', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'mindmap',
        root: '中心テーマ',
        branches: [
          { label: 'ブランチ1', children: [{ label: '子1' }, { label: '子2' }] },
          { label: 'ブランチ2' },
          { label: 'ブランチ3' },
        ],
      },
      true,
    );
    const child1 = doc.nodes.find((n) => n.text === '子1')!;
    const child2 = doc.nodes.find((n) => n.text === '子2')!;
    expect(child1).toBeDefined();
    expect(child2).toBeDefined();
    // AABB が重ならない（x または y のいずれかで分離）
    const overlap =
      child1.x < child2.x + child2.width &&
      child2.x < child1.x + child1.width &&
      child1.y < child2.y + child2.height &&
      child2.y < child1.y + child1.height;
    expect(overlap).toBe(false);
  });

  it('mindmap(FreeMind): ブランチを葉数バランスで左右に振り分ける', () => {
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
    // 葉数 [市場=2, 技術=1] → 市場=右(x>0), 技術=左(x<0)
    const center = (n: { x: number; width: number }): number => n.x + n.width / 2;
    const market = doc.nodes.find((n) => n.text === '市場')!;
    const tech = doc.nodes.find((n) => n.text === '技術')!;
    const b2b = doc.nodes.find((n) => n.text === 'B2B')!;
    expect(center(market)).toBeGreaterThan(0);
    expect(center(tech)).toBeLessThan(0);
    // 子は親と同じ右サイドへ伸びる
    expect(center(b2b)).toBeGreaterThan(0);
    // ブランチが root の左右に分離している
    expect(Math.sign(center(market))).not.toBe(Math.sign(center(tech)));
  });

  it('mindmap(FreeMind): metadata.path を維持し全エッジが bezier connector', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'mindmap',
        root: 'R',
        branches: [{ label: 'b0', children: [{ label: 'c0' }, { label: 'c1' }] }, { label: 'b1' }],
      },
      false,
    );
    const paths = doc.nodes.map((n) => n.metadata?.path).sort();
    expect(paths).toEqual(
      ['branches.0', 'branches.0.children.0', 'branches.0.children.1', 'branches.1', 'root'].sort(),
    );
    // FreeMind カーブは connector + bezier 専用（line では bezier 描画されない）
    expect(doc.edges.every((e) => e.type === 'connector')).toBe(true);
    expect(doc.edges.every((e) => e.style.routing === 'bezier')).toBe(true);
    // root + 各ブランチ/子へ 1 本ずつ = 4 本
    expect(doc.edges).toHaveLength(4);
  });

  it('mindmap(FreeMind): 出力 SVG に3次ベジェ曲線(C コマンド)が含まれる', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'mindmap',
        root: 'R',
        branches: [{ label: 'b0', children: [{ label: 'c0' }] }, { label: 'b1' }],
      },
      true,
    );
    const svg = exportToSvg(doc, { background: 'transparent', textColor: '#fff' });
    // bezier connector は <path d="M.. C.. "> として描画される（直角/直線ではない）
    expect(svg).toMatch(/<path d="M[\d.,-]+ C[\d.,\s-]+"/);
    expect(svg).not.toContain('NaN');
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

  it('structure-map: 全体＋部分見出し＋要素＋他領域ノードと、全体→部分・関係・全体→領域のエッジ', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'structure-map',
        whole: '検索体験',
        parts: [
          { label: '入力', items: ['クエリ補完', '履歴'] },
          { label: 'ランキング', items: ['スコア', '鮮度'] },
          { label: '表示', items: ['ハイライト'] },
        ],
        relations: [
          { from: '入力', to: 'ランキング' },
          { from: 'ランキング', to: '表示' },
        ],
        domains: ['推薦システム', 'データ基盤'],
      },
      true,
    );
    // 1 whole + 3 headers + (2+2+1) items + 2 domains
    expect(doc.nodes).toHaveLength(11);
    expect(doc.nodes.find((n) => n.id === 'whole')!.text).toBe('検索体験');
    expect(doc.nodes.find((n) => n.id === 'whole')!.type).toBe('ellipse');
    // 3 whole->part + 2 relations + 2 whole->domain
    expect(doc.edges).toHaveLength(7);
    expect(doc.edges.filter((e) => e.id.startsWith('rel-'))).toHaveLength(2);
    // 関係エッジは見出しノード id を端点に持つ
    const rel0 = doc.edges.find((e) => e.id === 'rel-0')!;
    expect(rel0.from.nodeId).toBe('part-0');
    expect(rel0.to.nodeId).toBe('part-1');
  });

  it('structure-map: relations/domains 省略でも全体＋部分のみで描画できる', () => {
    const doc = buildThinkingDiagram(
      {
        type: 'structure-map',
        whole: 'W',
        parts: [{ label: 'A', items: [] }],
        relations: [],
        domains: [],
      },
      false,
    );
    // whole + 1 header
    expect(doc.nodes).toHaveLength(2);
    // whole -> part のみ
    expect(doc.edges).toHaveLength(1);
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
    {
      type: 'structure-map',
      whole: 'W',
      parts: [{ label: 'A', items: ['x'] }, { label: 'B', items: [] }],
      relations: [{ from: 'A', to: 'B' }],
      domains: ['D'],
    },
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
