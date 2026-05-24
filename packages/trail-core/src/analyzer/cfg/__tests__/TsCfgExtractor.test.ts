import ts from 'typescript';
import { extractCfg } from '../TsCfgExtractor';

function cfgFor(code: string) {
  const sf = ts.createSourceFile('t.ts', code, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n)) fn = n;
  });
  return extractCfg(sf, fn!);
}

describe('extractCfg', () => {
  it('captures if/else with truncated condition and then/else blocks', () => {
    const cfg = cfgFor(`export function f(x: number) { if (x > 0) { doA(); } else { doB(); } }`);
    expect(cfg.hasBody).toBe(true);
    const ifStmt = cfg.body.stmts[0];
    expect(ifStmt.kind).toBe('if');
    if (ifStmt.kind === 'if') {
      expect(ifStmt.condition).toBe('x > 0');
      expect(ifStmt.then.stmts[0].kind).toBe('expr');
      expect(ifStmt.else?.stmts[0].kind).toBe('expr');
    }
  });

  it('captures loop as a single stmt without descending the body (flow parity)', () => {
    const cfg = cfgFor(`export function f(xs: number[]) { for (let i = 0; i < xs.length; i++) { use(xs[i]); } }`);
    const loop = cfg.body.stmts[0];
    expect(loop.kind).toBe('loop');
    if (loop.kind === 'loop') {
      expect(loop.loopKind).toBe('for');
      expect(loop.rawText.endsWith('…')).toBe(true);
    }
  });

  it('captures return with truncated expr text', () => {
    const cfg = cfgFor(`export function f() { return 'hello'; }`);
    const ret = cfg.body.stmts[0];
    expect(ret.kind).toBe('return');
    if (ret.kind === 'return') expect(ret.exprText).toBe("'hello'");
  });

  it('populates calls (for sequence reuse) including call arguments', () => {
    const cfg = cfgFor(`export function f() { foo(bar()); }`);
    const expr = cfg.body.stmts[0];
    expect(expr.kind).toBe('expr');
    if (expr.kind === 'expr') {
      expect(expr.calls[0].calleeName).toBe('foo');
      expect(expr.calls[0].args[0].kind).toBe('call');
    }
  });

  it('marks no-body functions', () => {
    const cfg = cfgFor(`export function f(): void;`);
    expect(cfg.hasBody).toBe(false);
  });
});
