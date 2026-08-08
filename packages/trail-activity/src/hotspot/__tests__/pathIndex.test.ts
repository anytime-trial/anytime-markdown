import {
  stripExt,
  isCodeElement,
  elementIdToFilePath,
  buildPathToCodeIdIndex,
  lookupCodeIdsByPath,
} from '../pathIndex';
import type { C4Element, C4Model } from '../../c4/types';

function codeEl(id: string): C4Element {
  return { id, type: 'code', name: id };
}

function nonCodeEl(id: string): C4Element {
  return { id, type: 'container', name: id };
}

describe('stripExt', () => {
  test.each([
    ['src/foo.ts', 'src/foo'],
    ['src/foo.tsx', 'src/foo'],
    ['src/foo.md', 'src/foo'],
    ['src/foo.mdx', 'src/foo'],
    ['src/foo.js', 'src/foo.js'],
    ['src/foo', 'src/foo'],
  ])('%s -> %s', (input, expected) => {
    expect(stripExt(input)).toBe(expected);
  });
});

describe('isCodeElement', () => {
  test('returns true for code element with file:: prefix', () => {
    expect(isCodeElement(codeEl('file::src/foo.ts'))).toBe(true);
  });

  test('returns false for non-code type', () => {
    expect(isCodeElement(nonCodeEl('file::src/foo.ts'))).toBe(false);
  });

  test('returns false for code type without file:: prefix', () => {
    const el: C4Element = { id: 'pkg_foo', type: 'code', name: 'x' };
    expect(isCodeElement(el)).toBe(false);
  });
});

describe('elementIdToFilePath', () => {
  test('strips file:: prefix', () => {
    expect(elementIdToFilePath('file::src/foo.ts')).toBe('src/foo.ts');
  });

  test('returns null for non-file id', () => {
    expect(elementIdToFilePath('pkg_foo')).toBeNull();
  });
});

describe('buildPathToCodeIdIndex', () => {
  test('indexes single code element', () => {
    const model: C4Model = { elements: [codeEl('file::src/foo.ts')] } as unknown as C4Model;
    const idx = buildPathToCodeIdIndex(model);
    expect(idx.get('src/foo')).toEqual(['file::src/foo.ts']);
  });

  test('skips non-code elements', () => {
    const model: C4Model = { elements: [nonCodeEl('pkg_bar'), codeEl('file::src/x.ts')] } as unknown as C4Model;
    const idx = buildPathToCodeIdIndex(model);
    expect(idx.size).toBe(1);
    expect(idx.has('pkg_bar')).toBe(false);
  });

  test('accumulates multiple files with same base path into one list', () => {
    const model: C4Model = {
      elements: [
        codeEl('file::src/Button.ts'),
        codeEl('file::src/Button.tsx'),
      ],
    } as unknown as C4Model;
    const idx = buildPathToCodeIdIndex(model);
    const list = idx.get('src/Button') ?? [];
    expect(list).toHaveLength(2);
    expect(list).toContain('file::src/Button.ts');
    expect(list).toContain('file::src/Button.tsx');
  });
});

describe('lookupCodeIdsByPath', () => {
  test('returns ids for known path', () => {
    const index = new Map([['src/foo', ['file::src/foo.ts']]]);
    expect(lookupCodeIdsByPath(index, 'src/foo.ts')).toEqual(['file::src/foo.ts']);
  });

  test('returns empty array for unknown path', () => {
    const index = new Map<string, string[]>();
    expect(lookupCodeIdsByPath(index, 'src/missing.ts')).toEqual([]);
  });
});
