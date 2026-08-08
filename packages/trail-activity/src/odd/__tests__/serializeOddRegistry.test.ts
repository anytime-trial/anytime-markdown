import { parseOddRegistry } from '../parseOddRegistry';
import { serializeOddRegistry } from '../serializeOddRegistry';
import type { OddRegistry } from '../types';

/**
 * 往復（serialize → parse）が恒等になることを固定する。`get_odd_policy` の出力を
 * `odd.json` の雛形として使えることが本関数の存在理由なので、往復の恒等性そのものが
 * 仕様であり、個別フィールドの形の検査はその補助にすぎない。
 */
function roundTrip(registry: OddRegistry): OddRegistry {
  const result = parseOddRegistry(JSON.stringify(serializeOddRegistry(registry)));
  if (result.kind === 'error') {
    throw new Error(`round trip failed to parse: ${result.reason}`);
  }
  return result.registry;
}

const FULL: OddRegistry = {
  version: 1,
  roots: ['/repo', '/docs'],
  restricted: [
    { kind: 'prefix', value: '/home/user/.claude', note: 'ユーザー永続データ領域' },
    { kind: 'pattern', value: '/.env' },
  ],
  languages: ['typescript', 'markdown'],
  operations: { code_change: 'allow', persistent_data_write: 'deny' },
  narrowing: 'release_freeze',
  godNodePercentile: 42,
};

const MINIMAL: OddRegistry = {
  version: 1,
  roots: ['/repo'],
  restricted: [],
  languages: null,
  operations: {},
  narrowing: 'normal',
  godNodePercentile: 5,
};

describe('serializeOddRegistry', () => {
  describe('往復が恒等になる', () => {
    it.each([
      ['全フィールドを持つレジストリ', FULL],
      ['最小のレジストリ', MINIMAL],
      [
        '言語を空配列で宣言したレジストリ（「許容言語なし」）',
        { ...MINIMAL, languages: [] } satisfies OddRegistry,
      ],
      [
        'note のない制限領域だけを持つレジストリ',
        { ...MINIMAL, restricted: [{ kind: 'pattern', value: '/.github/' }] } satisfies OddRegistry,
      ],
      [
        // パーサは note の非空を検査しない（非空を要求するのは value だけ）ため、
        // 空文字列が往復で消えたり undefined に化けたりしないことを固定する
        'note が空文字列の制限領域を持つレジストリ',
        {
          ...MINIMAL,
          restricted: [{ kind: 'pattern', value: '/.github/', note: '' }],
        } satisfies OddRegistry,
      ],
      ['縮小状態が incident のレジストリ', { ...MINIMAL, narrowing: 'incident' } satisfies OddRegistry],
    ])('%s', (_label, registry) => {
      expect(roundTrip(registry)).toEqual(registry);
    });
  });

  it('narrowing をオブジェクト形で書き出す（内部形の文字列のままだと parse が invalid になる）', () => {
    expect(serializeOddRegistry(FULL).narrowing).toEqual({ state: 'release_freeze' });
  });

  it('godNodePercentile を impact の下に書き出す（フラットに置くと黙って既定値へ戻る）', () => {
    const file = serializeOddRegistry(FULL);
    expect(file.impact).toEqual({ godNodePercentile: 42 });
    expect(file).not.toHaveProperty('godNodePercentile');
  });

  it('languages が null のときキーごと省く（null を書くと parse が落ちる）', () => {
    const file = serializeOddRegistry(MINIMAL);
    expect(Object.hasOwn(file, 'languages')).toBe(false);
  });

  it('languages が空配列のときは省かずに残す（「許容言語なし」と「未指定」を潰さない）', () => {
    const file = serializeOddRegistry({ ...MINIMAL, languages: [] });
    expect(file.languages).toEqual([]);
  });

  it('note のない制限領域に note キーを生やさない', () => {
    const file = serializeOddRegistry({
      ...MINIMAL,
      restricted: [{ kind: 'pattern', value: '/.github/' }],
    });
    expect(Object.hasOwn(file.restricted[0], 'note')).toBe(false);
  });

  it('JSON.stringify できる（関数・undefined を混ぜない）', () => {
    expect(() => JSON.stringify(serializeOddRegistry(FULL))).not.toThrow();
  });
});
