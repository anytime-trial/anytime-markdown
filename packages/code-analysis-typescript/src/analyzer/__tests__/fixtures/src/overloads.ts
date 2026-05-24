export function compute(a: number): string;
export function compute(a: string): number;
export function compute(a: number | string): string | number {
  return typeof a === 'number' ? String(a) : Number(a);
}
