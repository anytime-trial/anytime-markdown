import type { ClassifiedFunction, ClassifiedFunctionInput } from './types';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function classifyFunctionRoles(
  functions: readonly ClassifiedFunctionInput[],
): ClassifiedFunction[] {
  if (functions.length === 0) return [];

  const fanIns = functions.map((f) => f.fanIn);
  const fanOuts = functions.map((f) => f.fanOut);
  const thrIn = median(fanIns);
  const thrOut = median(fanOuts);

  return functions.map((f) => {
    const highIn = f.fanIn > thrIn;
    const highOut = f.fanOut > thrOut;
    let role: ClassifiedFunction['role'];
    if (highIn && highOut) {
      role = 'hub';
    } else if (highIn) {
      role = 'leaf';
    } else if (highOut) {
      role = 'orchestrator';
    } else {
      role = 'peripheral';
    }
    return { filePath: f.filePath, functionName: f.functionName, role };
  });
}
