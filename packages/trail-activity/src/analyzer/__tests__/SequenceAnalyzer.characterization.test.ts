import ts from 'typescript';
import { SequenceAnalyzer } from '../SequenceAnalyzer';
import type { C4Model } from '../../c4/types';
import type { TrailGraph } from '../../model/types';

const ROOT = 'pkg_root';
const TARGET = 'pkg_target';

function buildModel(callerCode: string): {
  c4Model: C4Model;
  graph: TrailGraph;
  sourceFiles: Map<string, ts.SourceFile>;
} {
  const c4Model: C4Model = {
    title: 'test',
    level: 'component',
    elements: [
      { id: ROOT, type: 'component', name: 'Root' },
      { id: TARGET, type: 'component', name: 'Target' },
      { id: 'file::root.ts', type: 'code', name: 'root.ts', boundaryId: ROOT },
      { id: 'file::target.ts', type: 'code', name: 'target.ts', boundaryId: TARGET },
    ],
    relationships: [{ from: ROOT, to: TARGET }],
  };
  const graph: TrailGraph = {
    nodes: [
      { id: 'file::root.ts', label: 'root.ts', type: 'file', filePath: 'root.ts', line: 1 },
      { id: 'file::target.ts', label: 'target.ts', type: 'file', filePath: 'target.ts', line: 1 },
      { id: 'file::root.ts::caller', label: 'caller', type: 'function', filePath: 'root.ts', line: 1, parent: 'file::root.ts' },
      { id: 'file::target.ts::callee', label: 'callee', type: 'function', filePath: 'target.ts', line: 1, parent: 'file::target.ts' },
      { id: 'file::target.ts::other', label: 'other', type: 'function', filePath: 'target.ts', line: 2, parent: 'file::target.ts' },
    ],
    edges: [
      { source: 'file::root.ts::caller', target: 'file::target.ts::callee', type: 'call' },
      { source: 'file::root.ts::caller', target: 'file::target.ts::other', type: 'call' },
    ],
    metadata: { projectRoot: '/tmp', analyzedAt: '2026-05-24', fileCount: 2 },
  };
  const sourceFiles = new Map<string, ts.SourceFile>();
  sourceFiles.set('root.ts', ts.createSourceFile('root.ts', callerCode, ts.ScriptTarget.Latest, true));
  sourceFiles.set(
    'target.ts',
    ts.createSourceFile('target.ts', 'export function callee() {} export function other() {}', ts.ScriptTarget.Latest, true),
  );
  return { c4Model, graph, sourceFiles };
}

const SAMPLES: Record<string, string> = {
  directCall: `export function caller() { callee(); }`,
  ifElse: `export function caller(x: number) { if (x > 0) { callee(); } else { other(); } }`,
  ifOpt: `export function caller(x: number) { if (x > 0) { callee(); } }`,
  forLoop: `export function caller(xs: number[]) { for (let i = 0; i < xs.length; i++) { callee(); } }`,
  forEach: `export function caller(xs: number[]) { xs.forEach((x) => { callee(); }); }`,
  returnCall: `export function caller() { return callee(); }`,
  nestedArg: `export function caller() { other(callee()); }`,
  elseIf: `export function caller(x: number) { if (x > 1) { callee(); } else if (x > 0) { other(); } else { callee(); } }`,
};

describe('SequenceAnalyzer.build characterization', () => {
  for (const [name, code] of Object.entries(SAMPLES)) {
    it(`snapshot: ${name}`, () => {
      const { c4Model, graph, sourceFiles } = buildModel(code);
      expect(SequenceAnalyzer.build(ROOT, c4Model, graph, sourceFiles)).toMatchSnapshot();
    });
  }
});
