import {
  ARCHITECTURE_LAYERS,
  type ArchitectureLayer,
  type CodeGraphNode,
} from '../codeGraph';

describe('codeGraph layer mirror', () => {
  it('mirrors exactly the 9 code-analysis-core ArchitectureLayer members', () => {
    // ミラーずれ防止: code-analysis-core の ArchitectureLayer と同一メンバー（9層）を固定する。
    // core 側に層を増減した場合は trail-server の consuming ビルド（union 代入互換）で検出され、
    // 本テストはミラー配列自体の安定（誤編集での増減）を固定する。
    expect([...ARCHITECTURE_LAYERS].sort()).toEqual(
      [
        'analysis',
        'data',
        'foundation',
        'integration',
        'presentation-extension',
        'presentation-ui',
        'service-domain',
        'service-server',
        'utility',
      ].sort(),
    );
    expect(ARCHITECTURE_LAYERS).toHaveLength(9);
  });

  it('allows a CodeGraphNode to carry an optional layer', () => {
    const layer: ArchitectureLayer = 'data';
    const node: CodeGraphNode = {
      id: 'repo:packages/trail-core/src/codeGraph',
      label: 'codeGraph',
      repo: 'repo',
      package: 'trail-core',
      fileType: 'code',
      community: 0,
      communityLabel: '0',
      x: 0,
      y: 0,
      size: 1,
      layer,
    };
    expect(node.layer).toBe('data');
  });

  it('treats layer as optional (node without layer is valid)', () => {
    const node: CodeGraphNode = {
      id: 'repo:a',
      label: 'a',
      repo: 'repo',
      package: 'p',
      fileType: 'code',
      community: 0,
      communityLabel: '0',
      x: 0,
      y: 0,
      size: 1,
    };
    expect(node.layer).toBeUndefined();
  });
});
