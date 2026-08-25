import fs from 'node:fs';
import path from 'node:path';

import {
  ARCHITECTURE_LAYERS,
  countArchitectureNodes,
  flattenArchitectureNodes,
} from '../app/[locale]/architecture/architectureModel';
import { ARCH_ICON_KEYS } from '../app/[locale]/architecture/icons/ArchitectureIcon';
import enMessages from '../app/[locale]/architecture/i18n/en.json';
import jaMessages from '../app/[locale]/architecture/i18n/ja.json';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');

function collectKeys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    return collectKeys(child, childPrefix);
  });
}

function hasNestedKey(value: unknown, keyPath: string): boolean {
  let current: unknown = value;
  for (const segment of keyPath.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = Reflect.get(current, segment);
  }
  return typeof current === 'string';
}

describe('architectureModel', () => {
  it('すべてのノード id が一意である', () => {
    const ids = flattenArchitectureNodes().map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pkg を持つすべてのノードが実在する packages ディレクトリを指す', () => {
    const missingPackages = flattenArchitectureNodes()
      .filter((node) => node.pkg !== undefined)
      .filter((node) => !fs.existsSync(path.join(REPOSITORY_ROOT, 'packages', node.pkg ?? '')))
      .map((node) => node.pkg);

    expect(missingPackages).toEqual([]);
  });

  it('ノード集計と平坦化したノード数が一致する', () => {
    expect(countArchitectureNodes()).toBe(flattenArchitectureNodes().length);
  });

  it('ノードが指すアイコン識別子がすべて登録簿に存在する', () => {
    const known = new Set<string>(ARCH_ICON_KEYS);
    const unknownIcons = flattenArchitectureNodes()
      .map((node) => node.icon)
      .filter((icon): icon is NonNullable<typeof icon> => icon !== undefined)
      .filter((icon) => !known.has(icon));

    expect(unknownIcons).toEqual([]);
  });

  it('モデルが参照するキーが日本語と英語の両方に存在する', () => {
    const modelKeys = ARCHITECTURE_LAYERS.flatMap((layer) => [
      `layers.${layer.labelKey}`,
      `descriptions.${layer.descriptionKey}`,
      ...layer.groups.map((group) => `groups.${group.labelKey}`),
      ...(layer.flowKey ? [`flows.${layer.flowKey}`] : []),
    ]);

    for (const key of modelKeys) {
      expect(hasNestedKey(jaMessages, key)).toBe(true);
      expect(hasNestedKey(enMessages, key)).toBe(true);
    }
  });

  it('日本語と英語のキー集合が一致する', () => {
    expect([...collectKeys(jaMessages)].sort()).toEqual([...collectKeys(enMessages)].sort());
  });
});
