import { createHash } from 'node:crypto';
import { sha256Hex } from '../../presets/sha256';
import { canonicalizeSpec, computeSpecHash, type CooccurrenceFile } from '../../presets/cooccurrenceFile';

/** 参照実装。テストは Node 上で動くため node:crypto を使える（本体は使えない）。 */
function reference(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('sha256Hex', () => {
  it('matches node:crypto for the padding boundary lengths', () => {
    // 55/56 と 63/64 はパディングでブロックが 1 つ増える境目。実装を落とすならここ。
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
      const input = 'a'.repeat(length);
      expect(sha256Hex(input)).toBe(reference(input));
    }
  });

  it('matches node:crypto for multi-byte and surrogate-pair input', () => {
    // UTF-8 符号化を誤ると日本語や絵文字だけ食い違う。
    const inputs = [
      '納期遅延', '共起ネットワーク', '🙂', 'a🙂b', 'a b', 'ﬁ',
      '\uD800', 'a\uD800b', '\uDC00', 'a\uDC00', '\uD800\uD800',
    ];
    for (const input of inputs) {
      expect(sha256Hex(input)).toBe(reference(input));
    }
  });

  it('matches node:crypto for a pseudo-random corpus', () => {
    // 決定論的な擬似乱数（テストが実行ごとに変わらないようにする）。
    let seed = 123456789;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let i = 0; i < 200; i += 1) {
      const length = next() % 300;
      let input = '';
      for (let j = 0; j < length; j += 1) input += String.fromCharCode(next() % 0x2000);
      expect(sha256Hex(input)).toBe(reference(input));
    }
  });
});

describe('computeSpecHash', () => {
  function spec(labels: string[]): CooccurrenceFile['spec'] {
    return {
      nodes: labels.map((label, index) => ({ label, frequency: index + 1 })),
      links: labels.length > 1 ? [[0, 1, 3]] : [],
    };
  }

  it('keeps producing the node:crypto value for the canonicalized spec', () => {
    // 置き換え前と同じ値であること。値が変われば既存 .cooc.json の layout が全て無効になる。
    // 正規化文字列は推測せず canonicalizeSpec から取り、node:crypto と直接突き合わせる。
    const target = spec(['納期遅延', '人員不足']);
    const hash = computeSpecHash(target);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(reference(canonicalizeSpec(target)));
  });

  it('changes when words are reordered (S4a で実測した挙動を維持する)', () => {
    expect(computeSpecHash(spec(['A', 'B']))).not.toBe(computeSpecHash(spec(['B', 'A'])));
  });

  it('is stable across repeated calls', () => {
    expect(computeSpecHash(spec(['A', 'B']))).toBe(computeSpecHash(spec(['A', 'B'])));
  });
});
