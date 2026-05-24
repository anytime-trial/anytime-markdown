import { pureAdd as myAdd } from './mutations';

/** import alias を resolve して同一関数 ID にマージされることを検証する */
export function aliasCallerFn(): number {
  // pureAdd を myAdd という alias で 2 回呼ぶ
  // シンボル解決後は pureAdd の ID に統合されるべき
  return myAdd(1, 2) + myAdd(3, 4);
}
