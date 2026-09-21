/**
 * 判別子つき union の**取りこぼしを型検査に鳴らせる**ための出口。
 *
 * `if` の連鎖で「残りは消去法」と書かない。種別を 1 つ足した日に、連鎖はコンパイルを通したまま
 * 新しい種別を最後の枝へ黙って落とす（保存する形を決める枝でそれが起きると、読み戻せない
 * ファイルを書く）。`switch` の `default` でここを呼べば、足した日に型が合わなくなる。
 *
 * 実行時にも投げる。型を無視した値（外から来た JSON を素通しした等）が来たときに、
 * 黙って未定義を返すより落ちたほうが原因に近い。
 */
export function assertNever(value: never, where: string): never {
  throw new Error(`[diagram] ${where}: 想定外の種別です（${JSON.stringify(value)}）`);
}
