import enMessages from '@anytime-markdown/graph-viewer/src/i18n/en.json';
import jaMessages from '@anytime-markdown/graph-viewer/src/i18n/ja.json';

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

describe('graph-viewer i18n consistency', () => {
  test('ja と en のキー集合が完全に一致する', () => {
    const jaKeys = flatKeys(jaMessages as MessageTree);
    const enKeys = flatKeys(enMessages as MessageTree);
    expect(jaKeys).toEqual(enKeys);
  });

  test('Graph namespace を含む', () => {
    expect((jaMessages as Record<string, unknown>).Graph).toBeDefined();
    expect((enMessages as Record<string, unknown>).Graph).toBeDefined();
  });
});
