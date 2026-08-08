// packages/trail-activity/src/analyzer/__tests__/FlowAnalyzer.test.ts
import ts from 'typescript';
import { FlowAnalyzer } from '../FlowAnalyzer';

describe('FlowAnalyzer.buildControlFlow', () => {
  it('if文を decision ノードに変換する', () => {
    const code = `
      export function check(x: number) {
        if (x > 0) { return true; } else { return false; }
      }
    `;
    const sf = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
    let funcNode: ts.FunctionDeclaration | undefined;
    ts.forEachChild(sf, n => { if (ts.isFunctionDeclaration(n)) funcNode = n; });
    const graph = FlowAnalyzer.buildControlFlow(sf, funcNode!);

    expect(graph.nodes.some(n => n.kind === 'decision')).toBe(true);
    expect(graph.nodes.some(n => n.kind === 'start')).toBe(true);
    expect(graph.nodes.some(n => n.kind === 'end')).toBe(true);
    const decisionEdges = graph.edges.filter(e => e.label === 'true' || e.label === 'false');
    expect(decisionEdges.length).toBeGreaterThan(0);
  });

  it('return 文を return ノードに変換する', () => {
    const code = `export function greet() { return 'hello'; }`;
    const sf = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
    let funcNode: ts.FunctionDeclaration | undefined;
    ts.forEachChild(sf, n => { if (ts.isFunctionDeclaration(n)) funcNode = n; });
    const graph = FlowAnalyzer.buildControlFlow(sf, funcNode!);

    expect(graph.nodes.some(n => n.kind === 'return')).toBe(true);
  });
});
