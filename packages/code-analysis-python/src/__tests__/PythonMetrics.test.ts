import type { Node } from 'web-tree-sitter';
import { createPythonParser } from '../PythonParser';
import { PythonMetrics } from '../importance/PythonMetrics';

const SRC = `def f(items, obj):
    total = 0
    self.count = 0
    obj.attr = 1
    d["k"] = 2
    for x in items:
        if x > 0 and x < 10 or x == -1:
            total += x
        elif x == 0:
            continue
    items.append(total)
    del d["k"]
    try:
        risky()
    except ValueError:
        print("err")
        open("/tmp/x")
    return total if total else 0
`;

const PLAIN = `def g(a):
    return a + 1
`;

async function firstFunction(src: string): Promise<Node> {
  const parser = await createPythonParser();
  const root = parser.parse(src)!.rootNode;
  const fn = root.namedChildren.find((n) => n?.type === 'function_definition');
  if (!fn) throw new Error('no function');
  return fn;
}

describe('PythonMetrics', () => {
  it('counts cognitive complexity from control-flow / boolean nodes', async () => {
    // for(1) + if(1) + boolean_operator(2: "and","or") + except(1) + conditional(1) = 6
    const fn = await firstFunction(SRC);
    expect(PythonMetrics.cognitiveComplexity(fn)).toBe(6);
  });

  it('computes cyclomatic complexity as 1 + cognitive count', async () => {
    const fn = await firstFunction(SRC);
    expect(PythonMetrics.cyclomaticComplexity(fn)).toBe(7);
  });

  it('scores data mutation: non-local assigns (+3 each), augmented (+1), mutation method (+2), del (+2)', async () => {
    // self.count(+3) obj.attr(+3) d["k"](+3) total+=x(+1) items.append(+2) del(+2) = 14
    const fn = await firstFunction(SRC);
    expect(PythonMetrics.dataMutationScore(fn)).toBe(14);
  });

  it('does not score plain local assignment as mutation', async () => {
    const fn = await firstFunction(PLAIN);
    expect(PythonMetrics.dataMutationScore(fn)).toBe(0);
  });

  it('scores side effects: print(+1), open(+2)', async () => {
    const fn = await firstFunction(SRC);
    expect(PythonMetrics.sideEffectScore(fn)).toBe(3);
  });

  it('returns zero metrics for a pure function', async () => {
    const fn = await firstFunction(PLAIN);
    expect(PythonMetrics.cognitiveComplexity(fn)).toBe(0);
    expect(PythonMetrics.cyclomaticComplexity(fn)).toBe(1);
    expect(PythonMetrics.sideEffectScore(fn)).toBe(0);
  });
});
