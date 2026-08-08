import { classifyFunctionRoles } from '../classifyFunctionRoles';
import type { ClassifiedFunctionInput } from '../types';

function fn(
  functionName: string,
  fanIn: number,
  fanOut: number,
  filePath = 'src/foo.ts',
): ClassifiedFunctionInput {
  return { filePath, functionName, fanIn, fanOut };
}

describe('classifyFunctionRoles', () => {
  it('空配列入力で空配列を返す', () => {
    expect(classifyFunctionRoles([])).toEqual([]);
  });

  it('全関数が同じ fanIn / fanOut なら全員 peripheral (median ちょうどは「低」側)', () => {
    const input = [fn('a', 3, 3), fn('b', 3, 3), fn('c', 3, 3)];
    const result = classifyFunctionRoles(input);
    expect(result.map((r) => r.role)).toEqual(['peripheral', 'peripheral', 'peripheral']);
  });

  it('fanIn 高 + fanOut 0 → leaf', () => {
    // median fanIn = 2, median fanOut = 1
    // fn-a: fanIn=4 > 2 (high), fanOut=0 <= 1 (low) → leaf
    const input = [fn('fn-a', 4, 0), fn('fn-b', 2, 1), fn('fn-c', 1, 2)];
    const result = classifyFunctionRoles(input);
    const a = result.find((r) => r.functionName === 'fn-a');
    expect(a?.role).toBe('leaf');
  });

  it('fanIn 0 + fanOut 高 → orchestrator', () => {
    // median fanIn = 2, median fanOut = 1
    // fn-c: fanIn=0 <= 2 (low), fanOut=2 > 1 (high) → orchestrator
    const input = [fn('fn-a', 4, 0), fn('fn-b', 2, 1), fn('fn-c', 0, 2)];
    const result = classifyFunctionRoles(input);
    const c = result.find((r) => r.functionName === 'fn-c');
    expect(c?.role).toBe('orchestrator');
  });

  it('fanIn 高 + fanOut 高 → hub', () => {
    // median fanIn = 2, median fanOut = 1
    // fn-hub: fanIn=5 > 2 (high), fanOut=3 > 1 (high) → hub
    const input = [fn('fn-hub', 5, 3), fn('fn-b', 2, 1), fn('fn-c', 1, 0)];
    const result = classifyFunctionRoles(input);
    const hub = result.find((r) => r.functionName === 'fn-hub');
    expect(hub?.role).toBe('hub');
  });

  it('median が偶数長で 2 つの中央値の平均で計算される', () => {
    // fanIn values: [1, 3] → sorted [1, 3] → median = (1+3)/2 = 2
    // fanOut values: [0, 4] → sorted [0, 4] → median = (0+4)/2 = 2
    // fn-a: fanIn=3 > 2 (high), fanOut=0 <= 2 (low) → leaf
    // fn-b: fanIn=1 <= 2 (low), fanOut=4 > 2 (high) → orchestrator
    const input = [fn('fn-a', 3, 0), fn('fn-b', 1, 4)];
    const result = classifyFunctionRoles(input);
    const a = result.find((r) => r.functionName === 'fn-a');
    const b = result.find((r) => r.functionName === 'fn-b');
    expect(a?.role).toBe('leaf');
    expect(b?.role).toBe('orchestrator');
  });
});
