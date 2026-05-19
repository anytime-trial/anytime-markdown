import { topoSortByDependsOn } from '../topoSort';

interface Node {
  id: string;
  dependsOn?: readonly string[];
}

const ids = (ns: Node[]): string[] => ns.map((n) => n.id);

describe('topoSortByDependsOn', () => {
  it('preserves input order when there are no dependencies', () => {
    const ns: Node[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(ids(topoSortByDependsOn(ns))).toEqual(['a', 'b', 'c']);
  });

  it('orders dependencies before dependents', () => {
    const ns: Node[] = [
      { id: 'embed', dependsOn: ['drift', 'code'] },
      { id: 'drift', dependsOn: ['code'] },
      { id: 'code' },
    ];
    const out = ids(topoSortByDependsOn(ns));
    expect(out.indexOf('code')).toBeLessThan(out.indexOf('drift'));
    expect(out.indexOf('drift')).toBeLessThan(out.indexOf('embed'));
  });

  it('keeps independent nodes in stable input order', () => {
    const ns: Node[] = [
      { id: 'conv' },
      { id: 'code' },
      { id: 'drift', dependsOn: ['conv', 'code'] },
    ];
    const out = ids(topoSortByDependsOn(ns));
    expect(out.indexOf('conv')).toBeLessThan(out.indexOf('code')); // 入力順維持
    expect(out[2]).toBe('drift');
  });

  it('ignores dependencies that are not in the set', () => {
    const ns: Node[] = [{ id: 'a', dependsOn: ['external-not-present'] }, { id: 'b' }];
    expect(ids(topoSortByDependsOn(ns))).toEqual(['a', 'b']);
  });

  it('throws on a dependency cycle', () => {
    const ns: Node[] = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ];
    expect(() => topoSortByDependsOn(ns)).toThrow(/[Cc]yclic/);
  });
});
