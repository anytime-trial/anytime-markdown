import { pureAdd } from './mutations';

/** ネスト関数の呼び出しが外側関数のカウントに含まれないことを検証する */
export function outerFn(): number {
  // 外側で1回呼ぶ
  const x = pureAdd(1, 2);
  
  // ネスト関数: この中の呼び出しは outerFn のカウントに含まれない
  function innerFn(): number {
    return pureAdd(10, 20); // outerFn のカウントに含まれないこと
  }
  
  return x + innerFn();
}
