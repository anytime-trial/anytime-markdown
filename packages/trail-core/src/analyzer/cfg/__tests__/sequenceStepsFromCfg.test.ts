import ts from 'typescript';
import { extractCfg } from '../TsCfgExtractor';
import { sequenceStepsFromCfg, type SeqWalkOptions } from '../sequenceStepsFromCfg';
import type { SequenceStep } from '@anytime-markdown/trace-core/c4Sequence';

function stepsFor(code: string, calleeNames: string[]): SequenceStep[] {
  const sf = ts.createSourceFile('t.ts', code, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sf, (n) => {
    if (ts.isFunctionDeclaration(n)) fn = n;
  });
  const opts: SeqWalkOptions = {
    calleeNames: new Set(calleeNames),
    from: 'A',
    to: 'B',
    callerFnName: 'caller',
    chainId: 'c1',
    maxSteps: 500,
  };
  return sequenceStepsFromCfg(extractCfg(sf, fn!).body, opts).steps;
}

describe('sequenceStepsFromCfg', () => {
  it('emits a call step for a callee in the set', () => {
    const steps = stepsFor(`export function caller() { callee(); }`, ['callee']);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'call', fnName: 'callee', from: 'A', to: 'B', callerFnName: 'caller', chainId: 'c1' });
  });

  it('ignores calls not in the set', () => {
    expect(stepsFor(`export function caller() { skip(); }`, ['callee'])).toHaveLength(0);
  });

  it('wraps if/else into alt with an else branch', () => {
    const steps = stepsFor(`export function caller(x: number) { if (x) { callee(); } else { callee(); } }`, ['callee']);
    expect(steps[0].kind).toBe('fragment');
    if (steps[0].kind === 'fragment') {
      expect(steps[0].fragment.kind).toBe('alt');
      if (steps[0].fragment.kind === 'alt') {
        expect(steps[0].fragment.branches[1].condition).toBe('else');
      }
    }
  });

  it('wraps if (no else) into opt', () => {
    const steps = stepsFor(`export function caller(x: number) { if (x) { callee(); } }`, ['callee']);
    if (steps[0].kind !== 'fragment') throw new Error('expected fragment');
    expect(steps[0].fragment.kind).toBe('opt');
  });

  it('wraps a for-of loop into loop', () => {
    const steps = stepsFor(`export function caller(xs: number[]) { for (const x of xs) { callee(); } }`, ['callee']);
    if (steps[0].kind !== 'fragment') throw new Error('expected fragment');
    expect(steps[0].fragment.kind).toBe('loop');
  });

  it('wraps forEach callback into loop', () => {
    const steps = stepsFor(`export function caller(xs: number[]) { xs.forEach((x) => { callee(); }); }`, ['callee']);
    if (steps[0].kind !== 'fragment') throw new Error('expected fragment');
    expect(steps[0].fragment.kind).toBe('loop');
  });

  it('collects calls inside a return expression', () => {
    const steps = stepsFor(`export function caller() { return callee(); }`, ['callee']);
    expect(steps.some((s) => s.kind === 'call' && s.fnName === 'callee')).toBe(true);
  });
});
