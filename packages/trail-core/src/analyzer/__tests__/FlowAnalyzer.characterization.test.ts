import ts from 'typescript';
import { FlowAnalyzer } from '../FlowAnalyzer';

function flowFor(code: string) {
  const sf = ts.createSourceFile('t.ts', code, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n)) fn = n;
  });
  return FlowAnalyzer.buildControlFlow(sf, fn!);
}

const SAMPLES: Record<string, string> = {
  ifElse: `export function f(x: number) { if (x > 0) { doA(); } else { doB(); } }`,
  loop: `export function f(xs: number[]) { for (let i = 0; i < xs.length; i++) { use(xs[i]); } }`,
  tryCatch: `export function f() { try { risky(); } catch (e) { handle(e); } }`,
  returns: `export function f(x: number) { if (x) { return 1; } return 0; }`,
  throws: `export function f(x: number) { if (!x) { throw new Error('x'); } work(); }`,
  empty: `export function f(): void;`,
};

describe('FlowAnalyzer.buildControlFlow characterization', () => {
  for (const [name, code] of Object.entries(SAMPLES)) {
    it(`snapshot: ${name}`, () => {
      expect(flowFor(code)).toMatchSnapshot();
    });
  }
});
