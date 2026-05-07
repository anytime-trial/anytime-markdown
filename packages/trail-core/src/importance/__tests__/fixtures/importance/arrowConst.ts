export const arrowFn = (a: number, b: number): number => a + b;

export function callerOfArrow(): number {
  return arrowFn(1, 2) + arrowFn(3, 4);
}
