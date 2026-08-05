import { parseOddRegistry } from '../parseOddRegistry';

function valid(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    roots: ['/anytime-markdown'],
    restricted: [{ kind: 'prefix', value: '/home/user/.claude', note: '永続データ' }],
    ...overrides,
  });
}

describe('parseOddRegistry', () => {
  it('妥当なレジストリを構造化する', () => {
    const result = parseOddRegistry(
      valid({
        languages: ['typescript'],
        operations: { code_change: 'allow', remote_push: 'confirm' },
        narrowing: { state: 'release_freeze' },
        impact: { godNodePercentile: 3 },
      }),
    );

    expect(result).toEqual({
      kind: 'ok',
      registry: {
        version: 1,
        roots: ['/anytime-markdown'],
        restricted: [{ kind: 'prefix', value: '/home/user/.claude', note: '永続データ' }],
        languages: ['typescript'],
        operations: { code_change: 'allow', remote_push: 'confirm' },
        narrowing: 'release_freeze',
        godNodePercentile: 3,
      },
    });
  });

  it('省略可能な項目の既定を埋める（operations 空・narrowing normal・閾値 5%）', () => {
    const result = parseOddRegistry(valid());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.registry.operations).toEqual({});
    expect(result.registry.narrowing).toBe('normal');
    expect(result.registry.godNodePercentile).toBe(5);
  });

  it('languages の省略（制限なし）と空配列（許容言語なし）を区別する', () => {
    const omitted = parseOddRegistry(valid());
    const empty = parseOddRegistry(valid({ languages: [] }));
    expect(omitted.kind === 'ok' && omitted.registry.languages).toBeNull();
    expect(empty.kind === 'ok' && empty.registry.languages).toEqual([]);
  });

  it.each([
    ['JSON 構文エラー', '{ not json'],
    ['ルートが配列', '[]'],
    ['version 未対応', JSON.stringify({ version: 2, roots: ['/x'], restricted: [] })],
    ['roots が空', JSON.stringify({ version: 1, roots: [], restricted: [] })],
    ['roots に空文字', JSON.stringify({ version: 1, roots: [' '], restricted: [] })],
    ['restricted.kind が不正', valid({ restricted: [{ kind: 'glob', value: '/x' }] })],
    ['restricted.value が空', valid({ restricted: [{ kind: 'pattern', value: '' }] })],
    ['operations に未知の種別', valid({ operations: { deploy: 'allow' } })],
    ['operations の値が不正', valid({ operations: { code_change: 'maybe' } })],
    ['narrowing.state が不正', valid({ narrowing: { state: 'frozen' } })],
    ['閾値が範囲外', valid({ impact: { godNodePercentile: 0 } })],
  ])('%s は error を返し、既定値で埋めない', (_label, content) => {
    const result = parseOddRegistry(content);
    expect(result.kind).toBe('error');
  });

  it('未知の操作種別を黙って捨てない（綴り違いのポリシーが効かない状態を防ぐ）', () => {
    const result = parseOddRegistry(valid({ operations: { code_chnage: 'allow' } }));
    expect(result).toEqual({
      kind: 'error',
      reason: "operations has unknown operation kind 'code_chnage'",
    });
  });
});
