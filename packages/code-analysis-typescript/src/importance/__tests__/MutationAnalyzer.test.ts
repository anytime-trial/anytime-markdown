import path from 'node:path';
import ts from 'typescript';
import { MutationAnalyzer } from '../MutationAnalyzer';

// フィクスチャを TypeScript プログラムとして読み込む
function loadFixtureProgram() {
  const fixtureFile = path.resolve(
    __dirname,
    'fixtures/importance/mutations.ts',
  );
  const program = ts.createProgram([fixtureFile], {
    target: ts.ScriptTarget.ES2022,
    strict: true,
  });
  const sourceFile = program.getSourceFile(fixtureFile)!;
  const checker = program.getTypeChecker();
  return { sourceFile, checker };
}

function findFunctionNode(
  sourceFile: ts.SourceFile,
  name: string,
): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  ts.forEachChild(sourceFile, node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
    }
  });
  if (!found) throw new Error(`Function ${name} not found`);
  return found;
}

describe('MutationAnalyzer', () => {
  let sourceFile: ts.SourceFile;
  let checker: ts.TypeChecker;

  beforeAll(() => {
    ({ sourceFile, checker } = loadFixtureProgram());
  });

  describe('computeDataMutationScore', () => {
    it('returns 0 for pure function', () => {
      const node = findFunctionNode(sourceFile, 'pureAdd');
      expect(MutationAnalyzer.computeDataMutationScore(node)).toBe(0);
    });

    it('returns high score for function with many mutations', () => {
      const node = findFunctionNode(sourceFile, 'mutateManyWays');
      const score = MutationAnalyzer.computeDataMutationScore(node);
      // push(+2) + sort(+2) + arr[0]=0(+3) + delete(+2) + splice(+2) = 11
      expect(score).toBeGreaterThanOrEqual(10);
    });

    it('returns score for non-local assignment and compound assign', () => {
      const node = findFunctionNode(sourceFile, 'updateGlobal');
      const score = MutationAnalyzer.computeDataMutationScore(node);
      // globalState.count = ...(+3) + +=(...)(+1) = 4
      expect(score).toBeGreaterThanOrEqual(3);
    });
  });

  describe('computeSideEffectScore', () => {
    it('returns 0 for pure function', () => {
      const node = findFunctionNode(sourceFile, 'pureAdd');
      expect(MutationAnalyzer.computeSideEffectScore(node)).toBe(0);
    });

    it('returns score for console calls', () => {
      const node = findFunctionNode(sourceFile, 'withSideEffects');
      const score = MutationAnalyzer.computeSideEffectScore(node);
      // console.log(+1) + console.warn(+1) = 2
      expect(score).toBeGreaterThanOrEqual(2);
    });
  });
});
