import type { C4Element, C4Model } from '../c4/types';

const FILE_PREFIX = 'file::';
const STRIPPABLE_EXT_RE = /\.(tsx?|mdx?)$/;

export function stripExt(p: string): string {
  return p.replace(STRIPPABLE_EXT_RE, '');
}

export function isCodeElement(el: C4Element): boolean {
  return el.type === 'code' && el.id.startsWith(FILE_PREFIX);
}

export function elementIdToFilePath(id: string): string | null {
  if (!id.startsWith(FILE_PREFIX)) return null;
  return id.slice(FILE_PREFIX.length);
}

export function buildPathToCodeIdIndex(c4Model: C4Model): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const el of c4Model.elements) {
    if (!isCodeElement(el)) continue;
    const filePath = el.id.slice(FILE_PREFIX.length);
    const key = stripExt(filePath);
    const list = map.get(key);
    if (list) {
      list.push(el.id);
    } else {
      map.set(key, [el.id]);
    }
  }
  return map;
}

export function lookupCodeIdsByPath(
  index: ReadonlyMap<string, readonly string[]>,
  filePath: string,
): readonly string[] {
  return index.get(stripExt(filePath)) ?? [];
}
