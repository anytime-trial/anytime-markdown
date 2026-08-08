// packages/trail-activity/src/analyzer/__tests__/SequenceAnalyzer.test.ts
import ts from 'typescript';
import { SequenceAnalyzer } from '../SequenceAnalyzer';
import type { C4Model } from '../../c4/types';
import type { TrailGraph } from '../../model/types';
import type { SequenceFragment, SequenceStep } from '@anytime-markdown/trace-core/c4Sequence';

const ROOT = 'pkg_root';
const TARGET_OUT = 'pkg_target';
const SOURCE_IN = 'pkg_source';

function createSf(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

/** rootElement (caller side) と targetElement (callee side) を持つ最小モデル。 */
function buildOutModel(callerCode: string): { c4Model: C4Model; graph: TrailGraph; sourceFiles: Map<string, ts.SourceFile> } {
  const c4Model: C4Model = {
    title: 'test',
    level: 'component',
    elements: [
      { id: ROOT, type: 'component', name: 'Root' },
      { id: TARGET_OUT, type: 'component', name: 'TargetOut' },
      { id: 'file::root.ts', type: 'code', name: 'root.ts', boundaryId: ROOT },
      { id: 'file::target.ts', type: 'code', name: 'target.ts', boundaryId: TARGET_OUT },
    ],
    relationships: [
      { from: ROOT, to: TARGET_OUT },
    ],
  };

  const graph: TrailGraph = {
    nodes: [
      { id: 'file::root.ts', label: 'root.ts', type: 'file', filePath: 'root.ts', line: 1 },
      { id: 'file::target.ts', label: 'target.ts', type: 'file', filePath: 'target.ts', line: 1 },
      { id: 'file::root.ts::caller', label: 'caller', type: 'function', filePath: 'root.ts', line: 1, parent: 'file::root.ts' },
      { id: 'file::target.ts::callee', label: 'callee', type: 'function', filePath: 'target.ts', line: 1, parent: 'file::target.ts' },
      { id: 'file::target.ts::otherCallee', label: 'otherCallee', type: 'function', filePath: 'target.ts', line: 5, parent: 'file::target.ts' },
    ],
    edges: [
      { source: 'file::root.ts::caller', target: 'file::target.ts::callee', type: 'call' },
      { source: 'file::root.ts::caller', target: 'file::target.ts::otherCallee', type: 'call' },
    ],
    metadata: { projectRoot: '/tmp', analyzedAt: '2026-05-03', fileCount: 2 },
  };

  const sourceFiles = new Map<string, ts.SourceFile>();
  sourceFiles.set('root.ts', createSf('root.ts', callerCode));
  sourceFiles.set('target.ts', createSf('target.ts', 'export function callee() {} export function otherCallee() {}'));

  return { c4Model, graph, sourceFiles };
}

function findFragment(steps: readonly SequenceStep[]): SequenceFragment | null {
  for (const s of steps) {
    if (s.kind === 'fragment') return s.fragment;
  }
  return null;
}

function flattenCalls(fragment: SequenceFragment): { fnName: string; line?: number }[] {
  const result: { fnName: string; line?: number }[] = [];
  function visitFragment(f: SequenceFragment): void {
    if (f.kind === 'sequence') {
      for (const s of f.steps) visitStep(s);
    } else if (f.kind === 'alt') {
      for (const b of f.branches) for (const s of b.steps) visitStep(s);
    } else {
      for (const s of f.steps) visitStep(s);
    }
  }
  function visitStep(s: SequenceStep): void {
    if (s.kind === 'call') result.push({ fnName: s.fnName, line: s.line });
    else visitFragment(s.fragment);
  }
  visitFragment(fragment);
  return result;
}

describe('SequenceAnalyzer.build', () => {
  it('returns empty model when rootElementId is not in C4 model', () => {
    const { c4Model, graph, sourceFiles } = buildOutModel('export function caller() {}');
    const model = SequenceAnalyzer.build('unknown', c4Model, graph, sourceFiles);
    expect(model.participants).toEqual([]);
    expect(model.root).toEqual({ kind: 'sequence', steps: [] });
  });

  it('emits a single call step for a direct cross-element call', () => {
    const code = `export function caller() { callee(); }`;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    expect(model.participants.map((p) => p.elementId)).toEqual([ROOT, TARGET_OUT]);
    const calls = flattenCalls(model.root);
    expect(calls.map((c) => c.fnName)).toEqual(['callee']);
  });

  it('wraps calls in if/else into an alt fragment', () => {
    const code = `
      export function caller(x: number) {
        if (x > 0) {
          callee();
        } else {
          otherCallee();
        }
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    if (model.root.kind !== 'sequence') throw new Error('expected sequence root');
    const frag = findFragment(model.root.steps);
    expect(frag).not.toBeNull();
    expect(frag!.kind).toBe('alt');
    if (frag!.kind === 'alt') {
      expect(frag!.branches).toHaveLength(2);
      expect(frag!.branches[1].condition).toBe('else');
    }
    const calls = flattenCalls(model.root);
    expect(calls.map((c) => c.fnName).sort()).toEqual(['callee', 'otherCallee']);
  });

  it('wraps a call inside if (no else) into an opt fragment', () => {
    const code = `
      export function caller(ok: boolean) {
        if (ok) {
          callee();
        }
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    if (model.root.kind !== 'sequence') throw new Error('expected sequence root');
    const frag = findFragment(model.root.steps);
    expect(frag).not.toBeNull();
    expect(frag!.kind).toBe('opt');
  });

  it('wraps a call inside for-loop into a loop fragment', () => {
    const code = `
      export function caller(items: number[]) {
        for (let i = 0; i < items.length; i++) {
          callee();
        }
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    if (model.root.kind !== 'sequence') throw new Error('expected sequence root');
    const frag = findFragment(model.root.steps);
    expect(frag).not.toBeNull();
    expect(frag!.kind).toBe('loop');
  });

  it('wraps forEach callback into a loop fragment', () => {
    const code = `
      export function caller(items: number[]) {
        items.forEach((x) => {
          callee();
        });
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    if (model.root.kind !== 'sequence') throw new Error('expected sequence root');
    const frag = findFragment(model.root.steps);
    expect(frag).not.toBeNull();
    expect(frag!.kind).toBe('loop');
  });

  it('handles nested if and for', () => {
    const code = `
      export function caller(items: number[], ok: boolean) {
        if (ok) {
          for (let i = 0; i < items.length; i++) {
            callee();
          }
        }
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    if (model.root.kind !== 'sequence') throw new Error('expected sequence root');
    const outer = findFragment(model.root.steps);
    expect(outer?.kind).toBe('opt');
    if (outer?.kind === 'opt') {
      const inner = findFragment(outer.steps);
      expect(inner?.kind).toBe('loop');
    }
  });

  it('emits sequential calls in declaration order', () => {
    const code = `
      export function caller() {
        callee();
        otherCallee();
      }
    `;
    const { c4Model, graph, sourceFiles } = buildOutModel(code);
    const model = SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles);

    const calls = flattenCalls(model.root);
    expect(calls.map((c) => c.fnName)).toEqual(['callee', 'otherCallee']);
  });
});
