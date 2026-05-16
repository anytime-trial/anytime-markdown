// centrality/__tests__/aggregateRolesToC4.test.ts

import { aggregateRolesToC4 } from '../aggregateRolesToC4';
import type { ClassifiedFunction } from '../types';
import type { C4Element } from '../../domain/engine/c4Mapper';

// Test helper: build a minimal C4Element with package fallback support
function pkgElement(pkgName: string, type = 'container'): C4Element {
  return { id: `pkg_${pkgName}`, type, name: pkgName };
}

function fn(
  filePath: string,
  functionName: string,
  role: ClassifiedFunction['role'],
): ClassifiedFunction {
  return { filePath, functionName, role };
}

describe('aggregateRolesToC4', () => {
  it('classified が空で {} を返す', () => {
    const elements: C4Element[] = [pkgElement('trail-core')];
    expect(aggregateRolesToC4([], elements)).toEqual({});
  });

  it('1 ファイル / 1 要素 / 全 hub なら dominantRole=hub', () => {
    const elements: C4Element[] = [pkgElement('trail-core')];
    const classified: ClassifiedFunction[] = [
      fn('packages/trail-core/src/foo.ts', 'foo', 'hub'),
      fn('packages/trail-core/src/bar.ts', 'bar', 'hub'),
    ];
    const result = aggregateRolesToC4(classified, elements);
    expect(result['pkg_trail-core']).toMatchObject({
      dominantRole: 'hub',
      totalFunctions: 2,
    });
  });

  it('leaf 3 + hub 1 で dominantRole=leaf (多数決)', () => {
    const elements: C4Element[] = [pkgElement('trail-core')];
    const classified: ClassifiedFunction[] = [
      fn('packages/trail-core/src/a.ts', 'a', 'leaf'),
      fn('packages/trail-core/src/b.ts', 'b', 'leaf'),
      fn('packages/trail-core/src/c.ts', 'c', 'leaf'),
      fn('packages/trail-core/src/d.ts', 'd', 'hub'),
    ];
    const result = aggregateRolesToC4(classified, elements);
    expect(result['pkg_trail-core'].dominantRole).toBe('leaf');
    expect(result['pkg_trail-core'].totalFunctions).toBe(4);
  });

  it('leaf 2 + hub 2 同数なら dominantRole=hub (優先順位)', () => {
    const elements: C4Element[] = [pkgElement('trail-core')];
    const classified: ClassifiedFunction[] = [
      fn('packages/trail-core/src/a.ts', 'a', 'leaf'),
      fn('packages/trail-core/src/b.ts', 'b', 'leaf'),
      fn('packages/trail-core/src/c.ts', 'c', 'hub'),
      fn('packages/trail-core/src/d.ts', 'd', 'hub'),
    ];
    const result = aggregateRolesToC4(classified, elements);
    expect(result['pkg_trail-core'].dominantRole).toBe('hub');
  });

  it('system 要素はキーに含まれない', () => {
    const elements: C4Element[] = [
      pkgElement('trail-core'),
      { id: 'sys_anytime-markdown', type: 'system', name: 'anytime-markdown' },
    ];
    const classified: ClassifiedFunction[] = [
      fn('packages/trail-core/src/a.ts', 'a', 'hub'),
    ];
    const result = aggregateRolesToC4(classified, elements);
    expect(Object.keys(result)).not.toContain('sys_anytime-markdown');
  });
});
