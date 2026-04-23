import enMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/en.json';
import jaMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/ja.json';

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

describe('spreadsheet-viewer i18n consistency', () => {
  test('ja と en のキー集合が完全に一致する', () => {
    const jaKeys = flatKeys(jaMessages as MessageTree);
    const enKeys = flatKeys(enMessages as MessageTree);
    expect(jaKeys).toEqual(enKeys);
  });

  test('Spreadsheet namespace を含む', () => {
    expect((jaMessages as Record<string, unknown>).Spreadsheet).toBeDefined();
    expect((enMessages as Record<string, unknown>).Spreadsheet).toBeDefined();
  });

  test('SpreadsheetGrid で使われる主要キーが両言語に存在する', () => {
    const jaSpread = (jaMessages as Record<string, Record<string, string>>).Spreadsheet;
    const enSpread = (enMessages as Record<string, Record<string, string>>).Spreadsheet;
    const requiredKeys = [
      'alignLeft', 'alignCenter', 'alignRight',
      'spreadsheetApply', 'spreadsheetCancel', 'spreadsheetAuto', 'spreadsheetFixed',
      'spreadsheetInsertRowAbove', 'spreadsheetInsertRowBelow', 'spreadsheetDeleteRow',
      'spreadsheetInsertColLeft', 'spreadsheetInsertColRight', 'spreadsheetDeleteCol',
      'spreadsheetMoveRowUp', 'spreadsheetMoveRowDown',
      'spreadsheetMoveColLeft', 'spreadsheetMoveColRight',
      'spreadsheetCut', 'spreadsheetCopy', 'spreadsheetPaste',
      'spreadsheetFilter', 'spreadsheetFilterClear', 'spreadsheetFilterColumn',
      'spreadsheetFilterSelectAll',
      'spreadsheetCellSettings', 'spreadsheetHeightMode', 'spreadsheetWidthMode',
    ] as const;
    for (const key of requiredKeys) {
      expect(jaSpread[key]).toBeDefined();
      expect(enSpread[key]).toBeDefined();
    }
  });
});
