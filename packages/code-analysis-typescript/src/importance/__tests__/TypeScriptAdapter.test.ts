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
    const { ImportanceAnalyzer } = require('@anytime-markdown/code-analysis-core/importance');
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

describe('TypeScriptAdapter.computeFanOutMap', () => {
  const MUTATIONS_FILE = path.join(FIXTURE_DIR, 'mutations.ts');
  const CALLER_FILE = path.join(FIXTURE_DIR, 'caller.ts');
  const JSX_COMPONENT = path.join(FIXTURE_DIR, 'jsxComponent.tsx');
  const JSX_CONSUMER = path.join(FIXTURE_DIR, 'jsxConsumer.tsx');
  const FAN_OUT_NESTED = path.join(FIXTURE_DIR, 'fanOutNested.ts');
  const FAN_OUT_ALIAS = path.join(FIXTURE_DIR, 'fanOutAlias.ts');

  it('空関数（body に呼び出しなし）で { fanOut: 0, distinctCallees: 0 } を返す', () => {
    const adapter = new TypeScriptAdapter([MUTATIONS_FILE]);
    const map = adapter.computeFanOutMap();

    // pureAdd は body 内に関数呼び出しがない純粋な演算関数
    const pureAddId = [...map.keys()].find((k) => k.endsWith('::pureAdd'));
    expect(pureAddId).toBeDefined();
    const entry = map.get(pureAddId!);
    expect(entry).toBeDefined();
    expect(entry!.fanOut).toBe(0);
    expect(entry!.distinctCallees).toBe(0);
  });

  it('外部関数を 3 回呼ぶと fanOut=3, distinctCallees=1', () => {
    const adapter = new TypeScriptAdapter([MUTATIONS_FILE, CALLER_FILE]);
    const map = adapter.computeFanOutMap();

    // callerA は pureAdd を 2 回呼ぶ
    const callerAId = [...map.keys()].find((k) => k.endsWith('::callerA'));
    expect(callerAId).toBeDefined();
    const callerAEntry = map.get(callerAId!);
    expect(callerAEntry).toBeDefined();
    expect(callerAEntry!.fanOut).toBe(2);
    expect(callerAEntry!.distinctCallees).toBe(1);

    // callerB は pureAdd を 1 回呼ぶ
    const callerBId = [...map.keys()].find((k) => k.endsWith('::callerB'));
    expect(callerBId).toBeDefined();
    const callerBEntry = map.get(callerBId!);
    expect(callerBEntry).toBeDefined();
    expect(callerBEntry!.fanOut).toBe(1);
    expect(callerBEntry!.distinctCallees).toBe(1);
  });

  it('ネスト関数の呼び出しは外側関数のカウントに含めない', () => {
    const adapter = new TypeScriptAdapter([MUTATIONS_FILE, FAN_OUT_NESTED]);
    const map = adapter.computeFanOutMap();

    // outerFn は body 直下で pureAdd を 1 回、innerFn() を 1 回呼ぶ
    // innerFn の中の pureAdd は outerFn のカウントに含まれない
    const outerFnId = [...map.keys()].find((k) => k.endsWith('::outerFn'));
    expect(outerFnId).toBeDefined();
    const outerEntry = map.get(outerFnId!);
    expect(outerEntry).toBeDefined();
    // outerFn body: pureAdd(1,2) + innerFn() = 2回呼び出し
    expect(outerEntry!.fanOut).toBe(2);

    // innerFn は独立して pureAdd を 1 回呼ぶ
    const innerFnId = [...map.keys()].find((k) => k.endsWith('::innerFn'));
    expect(innerFnId).toBeDefined();
    const innerEntry = map.get(innerFnId!);
    expect(innerEntry).toBeDefined();
    expect(innerEntry!.fanOut).toBe(1);
  });

  it('JSX <Component /> も呼び出しとしてカウントする', () => {
    const adapter = new TypeScriptAdapter([JSX_COMPONENT, JSX_CONSUMER]);
    const map = adapter.computeFanOutMap();

    // App は PlainComp x2 + ArrowComp x1 = 3 回
    const appId = [...map.keys()].find((k) => k.endsWith('::App'));
    expect(appId).toBeDefined();
    const appEntry = map.get(appId!);
    expect(appEntry).toBeDefined();
    expect(appEntry!.fanOut).toBe(3);
    // PlainComp と ArrowComp の 2 distinct callees
    expect(appEntry!.distinctCallees).toBe(2);
  });

  it('import alias を resolve して同一関数 ID にマージする', () => {
    const adapter = new TypeScriptAdapter([MUTATIONS_FILE, FAN_OUT_ALIAS]);
    const map = adapter.computeFanOutMap();

    // aliasCallerFn は myAdd（pureAdd の alias）を 2 回呼ぶ
    // シンボル解決後は pureAdd の ID に統合されるので distinctCallees=1
    const aliasCallerId = [...map.keys()].find((k) => k.endsWith('::aliasCallerFn'));
    expect(aliasCallerId).toBeDefined();
    const aliasEntry = map.get(aliasCallerId!);
    expect(aliasEntry).toBeDefined();
    expect(aliasEntry!.fanOut).toBe(2);
    expect(aliasEntry!.distinctCallees).toBe(1);
  });
});
