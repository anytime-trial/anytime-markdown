import type { C4Element } from '../types';
import { computeComplexityMatrix } from '../metrics/computeComplexityMatrix';
import type { MessageInput } from '../metrics/computeComplexityMatrix';

const elements: C4Element[] = [
  { id: 'pkg_web-app', type: 'container', name: 'Web App' },
  { id: 'pkg_trail-core', type: 'container', name: 'Trail Core' },
];

describe('computeComplexityMatrix', () => {
  it('空メッセージ → 空エントリ', () => {
    const result = computeComplexityMatrix([], elements);
    expect(result.entries).toHaveLength(0);
  });

  it('Edit付きメッセージをパッケージにマッピングする', () => {
    const messages: MessageInput[] = [
      {
        outputTokens: 200,
        toolCallNames: ['Edit'],
        editedFilePaths: ['packages/web-app/src/App.tsx'],
      },
    ];
    const result = computeComplexityMatrix(messages, elements);
    const entry = result.entries.find(e => e.elementId === 'pkg_web-app');
    expect(entry).toBeDefined();
  });

  it('複数メッセージで最多分類を集計する', () => {
    const messages: MessageInput[] = [
      { outputTokens: 100, toolCallNames: [], editedFilePaths: ['packages/web-app/src/A.tsx'] },
      { outputTokens: 100, toolCallNames: [], editedFilePaths: ['packages/web-app/src/B.tsx'] },
      { outputTokens: 5000, toolCallNames: ['Edit', 'Read', 'Grep', 'Bash'], editedFilePaths: ['packages/web-app/src/C.tsx'] },
    ];
    const result = computeComplexityMatrix(messages, elements);
    const entry = result.entries.find(e => e.elementId === 'pkg_web-app')!;
    expect(entry).toBeDefined();
    // 最高は high-complexity
    expect(entry.highest).toBe('high-complexity');
  });

  it('高複雑度メッセージの最多/最高を正しく計算', () => {
    const messages: MessageInput[] = [
      { outputTokens: 5000, toolCallNames: ['Edit', 'Read', 'Grep'], editedFilePaths: ['packages/trail-core/src/a.ts', 'packages/trail-core/src/b.ts', 'packages/trail-core/src/c.ts'] },
    ];
    const result = computeComplexityMatrix(messages, elements);
    const entry = result.entries.find(e => e.elementId === 'pkg_trail-core')!;
    // uniqueFileCount=3 + Edit → multi-file-edit (first-match)
    // outputTokens=5000>3000 + 3種類ツール → high-complexity も成立
    // highest は全ルール独立評価で high-complexity
    expect(entry.highest).toBe('high-complexity');
  });

  it('generatedAt を設定する', () => {
    const before = Date.now();
    const result = computeComplexityMatrix([], elements);
    const after = Date.now();
    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
    expect(result.generatedAt).toBeLessThanOrEqual(after);
  });
});
