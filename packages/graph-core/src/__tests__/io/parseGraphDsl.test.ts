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

  it('structure-map を解析する（部分・関係・他領域）', () => {
    const spec = parseGraphDsl(
      [
        'type: structure-map',
        'whole: 検索体験',
        '- 入力: クエリ補完, 履歴',
        '- ランキング: スコア',
        'relations:',
        '- 入力 -> ランキング',
        'domains: 推薦システム, データ基盤',
      ].join('\n'),
    );
    expect(spec).toEqual({
      type: 'structure-map',
      whole: '検索体験',
      parts: [
        { label: '入力', items: ['クエリ補完', '履歴'] },
        { label: 'ランキング', items: ['スコア'] },
      ],
      relations: [{ from: '入力', to: 'ランキング' }],
      domains: ['推薦システム', 'データ基盤'],
    });
  });

  it('structure-map: 関係・他領域は省略可', () => {
    const spec = parseGraphDsl(['type: structure-map', 'whole: W', '- A: x', '- B'].join('\n'));
    expect(spec.type).toBe('structure-map');
    if (spec.type === 'structure-map') {
      expect(spec.parts).toEqual([{ label: 'A', items: ['x'] }, { label: 'B', items: [] }]);
      expect(spec.relations).toEqual([]);
      expect(spec.domains).toEqual([]);
    }
  });

  it('structure-map: エイリアス structure / whole-part を正規化する', () => {
    expect(parseGraphDsl(['type: structure', 'whole: W', '- A'].join('\n')).type).toBe('structure-map');
    expect(parseGraphDsl(['type: whole-part', 'whole: W', '- A'].join('\n')).type).toBe('structure-map');
  });

  it('cooccurrence を解析する（頻度・共起・クラスタ）', () => {
    const spec = parseGraphDsl(
      [
        'type: cooccurrence',
        'title: 納期遅延の要因',
        'subject: 納期遅延',
        '- 納期遅延: 40',
        '- 仕様変更: 25',
        '- 納期遅延 -- 仕様変更: 0.8',
        'cluster 工程: 納期遅延',
        'cluster 要求: 仕様変更',
      ].join('\n'),
    );
    expect(spec).toEqual({
      type: 'cooccurrence',
      title: '納期遅延の要因',
      subject: '納期遅延',
      nodes: [
        { label: '納期遅延', frequency: 40 },
        { label: '仕様変更', frequency: 25 },
      ],
      links: [{ a: '納期遅延', b: '仕様変更', strength: 0.8 }],
      clusters: [
        { label: '工程', members: ['納期遅延'] },
        { label: '要求', members: ['仕様変更'] },
      ],
    });
  });

  it('cooccurrence: 共起・クラスタ・subject は省略可', () => {
    const spec = parseGraphDsl(['type: cooccurrence', '- A: 1', '- B: 2'].join('\n'));
    expect(spec.type).toBe('cooccurrence');
    if (spec.type === 'cooccurrence') {
      expect(spec.nodes).toEqual([
        { label: 'A', frequency: 1 },
        { label: 'B', frequency: 2 },
      ]);
      expect(spec.links).toEqual([]);
      expect(spec.clusters).toEqual([]);
      expect(spec.subject).toBeUndefined();
    }
  });

  it('cooccurrence: エイリアス co-occurrence / 共起 / kh を正規化する', () => {
    for (const alias of ['co-occurrence', '共起', 'kh']) {
      expect(parseGraphDsl([`type: ${alias}`, '- A: 1'].join('\n')).type).toBe('cooccurrence');
    }
  });

  it('cooccurrence: 未定義語を指す共起行は明示エラー', () => {
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', '- A -- Z: 0.5'].join('\n')),
    ).toThrow(/"Z"/);
  });

  it('cooccurrence: 未定義語を含む cluster 行は明示エラー', () => {
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', 'cluster G: A, Z'].join('\n')),
    ).toThrow(/"Z"/);
  });

  it('cooccurrence: 頻度が数値でなければ明示エラー（黙って 0 にしない）', () => {
    expect(() => parseGraphDsl(['type: cooccurrence', '- A: たくさん'].join('\n'))).toThrow(
      GraphDslError,
    );
  });

  it('cooccurrence: 共起強度が数値でなければ明示エラー', () => {
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', '- B: 2', '- A -- B: 強い'].join('\n')),
    ).toThrow(GraphDslError);
  });

  it('cooccurrence: 同じ語を 2 回定義したら明示エラー', () => {
    // 黙って受理すると 2 つ目の円がどの共起にも結び付かない幽霊ノードになる
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', '- A: 5'].join('\n')),
    ).toThrow(/複数回定義/);
  });

  it('cooccurrence: 自己共起（A -- A）は明示エラー', () => {
    // 長さ 0 の線になり、強度の正規化も歪めるため（causal-loop の自己参照と同方針）
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', '- A -- A: 0.5'].join('\n')),
    ).toThrow(/自己共起/);
  });

  it('cooccurrence: 負の頻度・負の共起強度は明示エラー', () => {
    expect(() => parseGraphDsl(['type: cooccurrence', '- A: -1'].join('\n'))).toThrow(/負の値/);
    expect(() =>
      parseGraphDsl(['type: cooccurrence', '- A: 1', '- B: 2', '- A -- B: -0.5'].join('\n')),
    ).toThrow(/負の値/);
  });

  it('cooccurrence: 語が 1 つもなければ明示エラー', () => {
    expect(() => parseGraphDsl(['type: cooccurrence', 'title: x'].join('\n'))).toThrow(
      GraphDslError,
    );
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
    it('causal-loop の自己参照は明示エラー', () => {
      expect(() => parseGraphDsl('type: causal-loop\n在庫 -> 在庫: +')).toThrow(/自己参照/);
    });
    it('causal-loop の不正リンク行が "->" 多重出現で二次爆発しない（ReDoS 回帰）', () => {
      const evil = 'a->'.repeat(20_000) + 'x'; // 極性を欠く行
      const started = performance.now();
      expect(() => parseGraphDsl(`type: causal-loop\n${evil}`)).toThrow(/リンク/);
      expect(performance.now() - started).toBeLessThan(200);
    });
    it('structure-map で whole 欠落', () => {
      expect(() => parseGraphDsl('type: structure-map\n- A: x')).toThrow(/whole/);
    });
    it('structure-map で部分欠落', () => {
      expect(() => parseGraphDsl('type: structure-map\nwhole: W')).toThrow(/部分/);
    });
    it('structure-map の関係端点が部分に無いと明示エラー', () => {
      expect(() =>
        parseGraphDsl(['type: structure-map', 'whole: W', '- A: x', '- A -> Z'].join('\n')),
      ).toThrow(/存在しません/);
    });
    it.each([
      ['structure-map の関係行に終点が無い', ['type: structure-map', 'whole: W', '- A: x', '- A ->'].join('\n')],
      ['structure-map の関係行に始点が無い', ['type: structure-map', 'whole: W', '- A: x', '- -> A'].join('\n')],
    ])('%s と解釈できないと明示エラー', (_name, dsl) => {
      expect(() => parseGraphDsl(dsl)).toThrow(/関係行/);
    });
    it.each([
      ['pyramid', 'type: pyramid\ntitle: t'],
      ['mindmap', 'type: mindmap\nroot: r'],
      ['logic-tree', 'type: logic-tree\nroot: r'],
      ['why-chain', 'type: why-chain\nproblem: p'],
      ['morph-box', 'type: morph-box\ntitle: t'],
      ['affinity', 'type: affinity\ntitle: t'],
      ['causal-loop', 'type: causal-loop\ntitle: t'],
    ])('%s は要素が空だとエラー', (_type, dsl) => {
      expect(() => parseGraphDsl(dsl)).toThrow(GraphDslError);
    });
  });

  it('半角コロンと全角コロンが混在するヘッダ行は先に現れた方で区切る', () => {
    const spec = parseGraphDsl('type: pyramid\ntitle: 理念：ビジョン\n- 理念');
    expect(spec.type).toBe('pyramid');
    if (spec.type === 'pyramid') expect(spec.title).toBe('理念：ビジョン');
  });

  it('morph-box のパラメータと選択肢を解析する', () => {
    const spec = parseGraphDsl(['type: morph-box', 'title: 新製品', '- 素材: 樹脂, 金属', '- 形状: 円筒'].join('\n'));
    expect(spec.type).toBe('morph-box');
    if (spec.type === 'morph-box') {
      expect(spec.title).toBe('新製品');
      expect(spec.parameters).toEqual([
        { label: '素材', options: ['樹脂', '金属'] },
        { label: '形状', options: ['円筒'] },
      ]);
    }
  });

  it('図種名のスペース表記も解決する（causal loop / mind map）', () => {
    expect(parseGraphDsl('type: causal loop\na -> b: +').type).toBe('causal-loop');
    expect(parseGraphDsl('type: mind map\nroot: r\n- a').type).toBe('mindmap');
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
