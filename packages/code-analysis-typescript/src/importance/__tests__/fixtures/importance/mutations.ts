const globalState = { count: 0 };

/** 副作用なし・変更なし（低スコア期待） */
export function pureAdd(a: number, b: number): number {
  return a + b;
}

/** 配列ミューテーション複数（高スコア期待） */
export function mutateManyWays(arr: number[]): void {
  arr.push(99);           // mutation method
  arr.sort((a, b) => a - b); // mutation method
  arr[0] = 0;             // indexed assignment
  delete arr[1];          // delete operator
  arr.splice(0, 1);       // mutation method
}

/** 非ローカル変数への代入（高スコア期待） */
export function updateGlobal(): void {
  globalState.count = globalState.count + 1; // non-local assignment
  globalState.count += 5;                     // compound assignment
}

/** 副作用のみ（コンソール・fetch） */
export function withSideEffects(): void {
  console.log('hello');
  console.warn('warn');
}

/** if が1つある関数 */
export function singleBranch(x: number): number {
  if (x > 0) {
    return x;
  }
  return 0;
}

/** ネストした if が2つある関数 */
export function nestedBranch(x: number, y: number): number {
  if (x > 0) {
    if (y > 0) {
      return x + y;
    }
    return x;
  }
  return 0;
}
