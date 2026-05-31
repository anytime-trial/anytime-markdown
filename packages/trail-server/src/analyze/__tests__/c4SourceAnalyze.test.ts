import { c4SourceAnalyze } from '../c4SourceAnalyze';

// AST 解析（typescript）の挙動を検証。TrailDataServer ハンドラから移設したロジック。

describe('c4SourceAnalyze', () => {
  it('exports: ExportExtractor で export シンボルを抽出する', () => {
    const result = c4SourceAnalyze({
      kind: 'exports',
      componentId: 'pkg_foo',
      files: [{ filePath: 'src/foo.ts', content: 'export function greet(n: string){ return n; }\nexport const x = 1;\n' }],
    });
    expect(result.kind).toBe('exports');
    if (result.kind !== 'exports') throw new Error('unreachable');
    expect(result.symbols.length).toBeGreaterThanOrEqual(1);
  });

  it('flowchartControl: 指定関数の制御フローグラフを返す', () => {
    const result = c4SourceAnalyze({
      kind: 'flowchartControl',
      filePart: 'src/foo.ts',
      funcName: 'greet',
      files: [
        {
          filePath: 'src/foo.ts',
          content: 'export function greet(n: number){ if (n > 0) { return "pos"; } return "neg"; }\n',
        },
      ],
    });
    expect(result.kind).toBe('flowchart');
    if (result.kind !== 'flowchart') throw new Error('unreachable');
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('flowchartControl: 対象ファイル/関数が無ければ空グラフ', () => {
    const result = c4SourceAnalyze({
      kind: 'flowchartControl',
      filePart: 'src/missing.ts',
      funcName: 'nope',
      files: [{ filePath: 'src/foo.ts', content: 'export function greet(){}\n' }],
    });
    expect(result.kind).toBe('flowchart');
    if (result.kind !== 'flowchart') throw new Error('unreachable');
    expect(result.graph.nodes).toHaveLength(0);
  });

  it('flowchartCall: 呼び出しフローグラフを返す（空でもクラッシュしない）', () => {
    const result = c4SourceAnalyze({
      kind: 'flowchartCall',
      symbolId: 'src/foo.ts::greet',
      files: [{ filePath: 'src/foo.ts', content: 'function helper(){}\nexport function greet(){ helper(); }\n' }],
    });
    expect(result.kind).toBe('flowchart');
  });
});
