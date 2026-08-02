import enMessages from '../i18n/en.json';
import jaMessages from '../i18n/ja.json';

type MessageTree = Record<string, unknown>;

function flatKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatKeys(value as MessageTree, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

describe('markdown-core i18n consistency', () => {
  test('ja と en のキー集合が完全に一致する', () => {
    const jaKeys = flatKeys(jaMessages as MessageTree);
    const enKeys = flatKeys(enMessages as MessageTree);
    expect(jaKeys).toEqual(enKeys);
  });

  test('Graph namespace は markdown-core から除外されている（graph-viewer へ移動済み）', () => {
    expect((jaMessages as Record<string, unknown>).Graph).toBeUndefined();
    expect((enMessages as Record<string, unknown>).Graph).toBeUndefined();
  });
});
