import path from 'node:path';
import { TypeScriptAdapter } from '../adapters/TypeScriptAdapter';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/importance');

describe('TypeScriptAdapter', () => {
  let adapter: TypeScriptAdapter;

  beforeAll(() => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    adapter = new TypeScriptAdapter([fixtureFile]);
  });

  it('extracts function info for all functions in fixture', () => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const functions = adapter.extractFunctions([fixtureFile]);
    const names = functions.map(f => f.name);
    expect(names).toContain('pureAdd');
    expect(names).toContain('mutateManyWays');
    expect(names).toContain('updateGlobal');
    expect(names).toContain('withSideEffects');
  });

  it('sets language to "typescript"', () => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const functions = adapter.extractFunctions([fixtureFile]);
    expect(functions.every(f => f.language === 'typescript')).toBe(true);
  });

  it('sets correct startLine and endLine', () => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const functions = adapter.extractFunctions([fixtureFile]);
    const pureAdd = functions.find(f => f.name === 'pureAdd')!;
    expect(pureAdd.startLine).toBeGreaterThan(0);
    expect(pureAdd.endLine).toBeGreaterThanOrEqual(pureAdd.startLine);
  });

  it('computes higher dataMutationScore for mutateManyWays than pureAdd', () => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const functions = adapter.extractFunctions([fixtureFile]);

    const pureAddFn = functions.find(f => f.name === 'pureAdd')!;
    const mutateFn = functions.find(f => f.name === 'mutateManyWays')!;

    const pureMetrics = adapter.computeMetrics(pureAddFn);
    const mutateMetrics = adapter.computeMetrics(mutateFn);

    expect(mutateMetrics.dataMutationScore).toBeGreaterThan(pureMetrics.dataMutationScore);
  });

  it('computes higher sideEffectScore for withSideEffects than pureAdd', () => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const functions = adapter.extractFunctions([fixtureFile]);

    const pureAddFn = functions.find(f => f.name === 'pureAdd')!;
    const sideEffectFn = functions.find(f => f.name === 'withSideEffects')!;

    const pureMetrics = adapter.computeMetrics(pureAddFn);
    const sideEffectMetrics = adapter.computeMetrics(sideEffectFn);

    expect(sideEffectMetrics.sideEffectScore).toBeGreaterThan(pureMetrics.sideEffectScore);
  });
});

describe('TypeScriptAdapter.computeFanInMap', () => {
  it('counts calls to pureAdd from caller fixture', () => {
    const mutationsFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const callerFile = path.join(FIXTURE_DIR, 'caller.ts');
    const adapter = new TypeScriptAdapter([mutationsFile, callerFile]);

    const fanInMap = adapter.computeFanInMap();

    // pureAdd is called 3 times in caller.ts (callerA: 2 + callerB: 1)
    const functions = adapter.extractFunctions([mutationsFile]);
    const pureAdd = functions.find(f => f.name === 'pureAdd')!;
    expect(pureAdd).toBeDefined();
    expect(fanInMap.get(pureAdd.id)).toBe(3);
  });

  it('pureAdd scores higher than callerA when fanIn is counted', () => {
    const mutationsFile = path.join(FIXTURE_DIR, 'mutations.ts');
    const callerFile = path.join(FIXTURE_DIR, 'caller.ts');
    const adapter = new TypeScriptAdapter([mutationsFile, callerFile]);
    const { ImportanceAnalyzer } = require('../ImportanceAnalyzer');
    const analyzer = new ImportanceAnalyzer(adapter);

    const results = analyzer.analyze([mutationsFile, callerFile]);
    const pureAdd = results.find((f: { name: string }) => f.name === 'pureAdd')!;
    const callerA = results.find((f: { name: string }) => f.name === 'callerA')!;

    // pureAdd は3回呼ばれるため fanIn が最大 → callerA (fanIn=0) より高スコア
    expect(pureAdd.metrics.fanIn).toBe(3);
    expect(callerA.metrics.fanIn).toBe(0);
    expect(pureAdd.importanceScore).toBeGreaterThan(callerA.importanceScore);
  });
});

describe('TypeScriptAdapter.computeMetrics: cyclomaticComplexity', () => {
  let adapter: TypeScriptAdapter;
  let functions: ReturnType<TypeScriptAdapter['extractFunctions']>;

  beforeAll(() => {
    const fixtureFile = path.join(FIXTURE_DIR, 'mutations.ts');
    adapter = new TypeScriptAdapter([fixtureFile]);
    functions = adapter.extractFunctions([fixtureFile]);
  });

  it('singleBranch (if x1) has cyclomaticComplexity === 2', () => {
    const fn = functions.find(f => f.name === 'singleBranch');
    if (!fn) throw new Error('singleBranch not found in fixture');
    const metrics = adapter.computeMetrics(fn);
    expect(metrics.cyclomaticComplexity).toBe(2);
  });

  it('nestedBranch (nested if x2) has cyclomaticComplexity === 3', () => {
    const fn = functions.find(f => f.name === 'nestedBranch');
    if (!fn) throw new Error('nestedBranch not found in fixture');
    const metrics = adapter.computeMetrics(fn);
    expect(metrics.cyclomaticComplexity).toBe(3);
  });
});

describe('TypeScriptAdapter.computeFanInMap (JSX & arrow const)', () => {
  const JSX_COMPONENT = path.join(FIXTURE_DIR, 'jsxComponent.tsx');
  const JSX_CONSUMER = path.join(FIXTURE_DIR, 'jsxConsumer.tsx');
  const ARROW_CONST = path.join(FIXTURE_DIR, 'arrowConst.ts');

  it('counts <ArrowComp /> self-closing JSX usage as fanIn=1', () => {
    const adapter = new TypeScriptAdapter([JSX_COMPONENT, JSX_CONSUMER]);
    const map = adapter.computeFanInMap();
    const arrowId = [...map.keys()].find((k) => k.endsWith('::ArrowComp'));
    expect(arrowId).toBeDefined();
    expect(map.get(arrowId!)).toBe(1);
  });

  it('counts <PlainComp/> + <PlainComp></PlainComp> as fanIn=2', () => {
    const adapter = new TypeScriptAdapter([JSX_COMPONENT, JSX_CONSUMER]);
    const map = adapter.computeFanInMap();
    const plainId = [...map.keys()].find((k) => k.endsWith('::PlainComp'));
    expect(plainId).toBeDefined();
    expect(map.get(plainId!)).toBe(2);
  });

  it('counts arrow-bound const callers as fanIn=2 (regression for symbol→VariableDeclaration resolution)', () => {
    const adapter = new TypeScriptAdapter([ARROW_CONST]);
    const map = adapter.computeFanInMap();
    const arrowFnId = [...map.keys()].find((k) => k.endsWith('::arrowFn'));
    expect(arrowFnId).toBeDefined();
    expect(map.get(arrowFnId!)).toBe(2);
  });

  it('does not count host elements like <span> in fanIn map', () => {
    const adapter = new TypeScriptAdapter([JSX_COMPONENT, JSX_CONSUMER]);
    const map = adapter.computeFanInMap();
    expect([...map.keys()].some((k) => k.endsWith('::span') || k.endsWith('::div'))).toBe(false);
  });
});
