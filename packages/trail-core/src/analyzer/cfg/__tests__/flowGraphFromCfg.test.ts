import ts from 'typescript';
import { extractCfg } from '../TsCfgExtractor';
import { flowGraphFromCfg } from '../flowGraphFromCfg';
import { FlowAnalyzer } from '../../FlowAnalyzer';

function bothFor(code: string) {
  const sf = ts.createSourceFile('t.ts', code, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n)) fn = n;
  });
  const viaIr = flowGraphFromCfg(extractCfg(sf, fn!));
  const direct = FlowAnalyzer.buildControlFlow(sf, fn!);
  return { viaIr, direct };
}

describe('flowGraphFromCfg parity with FlowAnalyzer.buildControlFlow', () => {
  const samples = [
    `export function f(x: number) { if (x > 0) { doA(); } else { doB(); } }`,
    `export function f(xs: number[]) { for (let i = 0; i < xs.length; i++) { use(xs[i]); } }`,
    `export function f() { try { risky(); } catch (e) { handle(e); } }`,
    `export function f(x: number) { if (x) { return 1; } return 0; }`,
    `export function f(x: number) { if (!x) { throw new Error('x'); } work(); }`,
    `export function f(x: number) { if (x > 0) { a(); } else if (x < 0) { b(); } else { c(); } }`,
    `export function f() { { doA(); doB(); } work(); }`,
  ];
  for (const code of samples) {
    it(`produces identical FlowGraph: ${code.slice(20, 55)}`, () => {
      const { viaIr, direct } = bothFor(code);
      expect(viaIr).toEqual(direct);
    });
  }
});
