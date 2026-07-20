import { buildCooccurrence, type CooccurrenceSpec } from '../../presets/cooccurrence';

const SPEC: CooccurrenceSpec = {
  type: 'cooccurrence',
  title: '納期遅延の要因',
  subject: '納期遅延',
  nodes: [
    { label: '納期遅延', frequency: 40 },
    { label: '仕様変更', frequency: 25 },
    { label: 'レビュー待ち', frequency: 18 },
    { label: '人員不足', frequency: 12 },
  ],
  links: [
    { a: '納期遅延', b: '仕様変更', strength: 0.8 },
    { a: '納期遅延', b: 'レビュー待ち', strength: 0.5 },
    { a: '仕様変更', b: '人員不足', strength: 0.3 },
  ],
  clusters: [
    { label: '工程', members: ['納期遅延', 'レビュー待ち'] },
    { label: '要求', members: ['仕様変更'] },
    { label: '体制', members: ['人員不足'] },
  ],
};

/** ラベルからノードを引く。 */
function nodeOf(doc: ReturnType<typeof buildCooccurrence>, label: string) {
  const found = doc.nodes.find((n) => n.text === label);
  if (!found) throw new Error(`node not found: ${label}`);
  return found;
}

describe('buildCooccurrence', () => {
  it('語ごとに円（ellipse）ノードを生成する', () => {
    const doc = buildCooccurrence(SPEC, true);
    expect(doc.nodes).toHaveLength(4);
    for (const n of doc.nodes) {
      expect(n.type).toBe('ellipse');
      // 円なので縦横が等しい
      expect(n.width).toBeCloseTo(n.height, 6);
    }
  });

  it('円の大きさが出現頻度の順序に一致する', () => {
    const doc = buildCooccurrence(SPEC, true);
    const size = (label: string) => nodeOf(doc, label).width;
    expect(size('納期遅延')).toBeGreaterThan(size('仕様変更'));
    expect(size('仕様変更')).toBeGreaterThan(size('レビュー待ち'));
    expect(size('レビュー待ち')).toBeGreaterThan(size('人員不足'));
  });

  it('円の面積が頻度に比例する（直径ではなく面積で符号化する）', () => {
    const spec: CooccurrenceSpec = {
      type: 'cooccurrence',
      nodes: [
        { label: 'A', frequency: 0 },
        { label: 'B', frequency: 100 },
      ],
      links: [],
    };
    const doc = buildCooccurrence(spec, true);
    // 頻度 0 と最大の間で、半径差は sqrt スケール。直径比例なら 4 倍になる幅比が
    // sqrt スケールでは 2 倍相当に収まることを、境界の半径から確認する。
    const a = nodeOf(doc, 'A').width;
    const b = nodeOf(doc, 'B').width;
    expect(b).toBeGreaterThan(a);
    // 中間頻度 25%（sqrt で 50%）が、線形補間の 25% 位置より大きいこと
    const mid = buildCooccurrence(
      {
        type: 'cooccurrence',
        nodes: [
          { label: 'A', frequency: 0 },
          { label: 'M', frequency: 25 },
          { label: 'B', frequency: 100 },
        ],
        links: [],
      },
      true,
    );
    const m = nodeOf(mid, 'M').width;
    expect(m).toBeGreaterThan(a + (b - a) * 0.25);
    expect(m).toBeCloseTo(a + (b - a) * 0.5, 4);
  });

  it('線の太さが共起強度の順序に一致し、無向（矢印なし）である', () => {
    const doc = buildCooccurrence(SPEC, true);
    expect(doc.edges).toHaveLength(3);
    const widths = doc.edges.map((e) => e.style.strokeWidth ?? 0);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
    for (const e of doc.edges) {
      expect(e.style.endShape).toBeUndefined();
    }
  });

  it('クラスタごとに枠線の色を変える', () => {
    const doc = buildCooccurrence(SPEC, true);
    const strokeOf = (label: string) => nodeOf(doc, label).style.stroke;
    // 同一クラスタは同色
    expect(strokeOf('納期遅延')).toBe(strokeOf('レビュー待ち'));
    // 異なるクラスタは別色
    expect(strokeOf('納期遅延')).not.toBe(strokeOf('仕様変更'));
    expect(strokeOf('仕様変更')).not.toBe(strokeOf('人員不足'));
  });

  it('subject に指定した語を太枠で強調する', () => {
    const doc = buildCooccurrence(SPEC, true);
    const subject = nodeOf(doc, '納期遅延');
    const other = nodeOf(doc, '仕様変更');
    expect(subject.style.strokeWidth ?? 0).toBeGreaterThan(other.style.strokeWidth ?? 0);
  });

  it('subject 未指定でも成立する', () => {
    const doc = buildCooccurrence({ ...SPEC, subject: undefined }, true);
    const widths = doc.nodes.map((n) => n.style.strokeWidth ?? 0);
    expect(new Set(widths).size).toBe(1);
  });

  it('クラスタ未指定の語は既定サーフェス色になり、破綻しない', () => {
    const doc = buildCooccurrence({ ...SPEC, clusters: undefined }, true);
    expect(doc.nodes).toHaveLength(4);
    const strokes = new Set(doc.nodes.map((n) => n.style.stroke));
    expect(strokes.size).toBe(1);
  });

  it('ダーク / ライトの両モードで色が解決される', () => {
    const dark = buildCooccurrence(SPEC, true);
    const light = buildCooccurrence(SPEC, false);
    for (const doc of [dark, light]) {
      for (const n of doc.nodes) {
        expect(n.style.fill).toBeTruthy();
        expect(n.style.stroke).toBeTruthy();
        expect(n.style.fontColor).toBeTruthy();
      }
    }
    expect(nodeOf(dark, '納期遅延').style.fontColor).not.toBe(nodeOf(light, '納期遅延').style.fontColor);
  });

  it('同一入力に対して同一の図を返す', () => {
    expect(buildCooccurrence(SPEC, true)).toEqual(buildCooccurrence(SPEC, true));
  });

  it('円の大きさはラベルの長さに影響されない（頻度のみで決まる）', () => {
    // ラベル長で円を膨らませると「円の大きさ＝出現頻度」の符号化が壊れるため、
    // 長いラベルの低頻度語が短いラベルの高頻度語より大きくなってはならない。
    const doc = buildCooccurrence(
      {
        type: 'cooccurrence',
        nodes: [
          { label: '非常に長いラベルを持つ語', frequency: 1 },
          { label: '短', frequency: 100 },
        ],
        links: [],
      },
      true,
    );
    expect(nodeOf(doc, '非常に長いラベルを持つ語').width).toBeLessThan(nodeOf(doc, '短').width);
  });

  it('小さい円ではフォントを縮めるが、下限を下回らない', () => {
    const doc = buildCooccurrence(
      {
        type: 'cooccurrence',
        nodes: [
          { label: '長いラベルの低頻度語', frequency: 1 },
          { label: '高', frequency: 100 },
        ],
        links: [],
      },
      true,
    );
    const small = nodeOf(doc, '長いラベルの低頻度語').style.fontSize ?? 0;
    const large = nodeOf(doc, '高').style.fontSize ?? 0;
    expect(small).toBeLessThanOrEqual(large);
    expect(small).toBeGreaterThanOrEqual(10);
  });

  it('密なネットワークでも円が重ならない', () => {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const links: CooccurrenceSpec['links'] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        links.push({ a: labels[i], b: labels[j], strength: 0.4 + ((i + j) % 5) * 0.15 });
      }
    }
    const doc = buildCooccurrence(
      {
        type: 'cooccurrence',
        nodes: labels.map((label, i) => ({ label, frequency: (i + 1) * 7 })),
        links,
      },
      true,
    );
    for (let i = 0; i < doc.nodes.length; i++) {
      for (let j = i + 1; j < doc.nodes.length; j++) {
        const a = doc.nodes[i];
        const b = doc.nodes[j];
        const centerDistance = Math.hypot(
          a.x + a.width / 2 - (b.x + b.width / 2),
          a.y + a.height / 2 - (b.y + b.height / 2),
        );
        const gap = centerDistance - (a.width / 2 + b.width / 2);
        expect(gap).toBeGreaterThan(0);
      }
    }
  });

  it('共起が 0 件でもノードだけの図として成立する', () => {
    const doc = buildCooccurrence(
      { type: 'cooccurrence', nodes: [{ label: 'A', frequency: 1 }], links: [] },
      true,
    );
    expect(doc.nodes).toHaveLength(1);
    expect(doc.edges).toHaveLength(0);
  });
});
