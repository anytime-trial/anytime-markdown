import { pureAdd } from './mutations';

/** pureAdd を複数回呼び出す（fanIn 検証用） */
export function callerA(): number {
  return pureAdd(1, 2) + pureAdd(3, 4);
}

export function callerB(): number {
  return pureAdd(10, 20);
}
