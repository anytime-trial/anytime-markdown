/**
 * DB open 失敗の原因分類。
 *
 * mcp-trail の DB 依存ツールは caravan-book.db → activity.db のフォールバックを持つが、
 * **原因が native binary の解決なら 2 つの DB は同じ理由で落ちる**（開く経路を共有している）。
 * その場合のフォールバックは二重に試して二重に失敗するだけなので、呼び出し側へは
 * 「どちらの DB が読めなかったか」ではなく「共通の原因で DB 経路ごと死んでいる」ことを返す。
 */
export type DbOpenFailureKind = 'native-binding' | 'other';

/**
 * `bindings` によるネイティブモジュール解決の失敗を表すシグネチャ。
 *
 * - `Cannot read properties of undefined (reading 'indexOf')`
 *   bindings の getFileName がスタックからファイル名を取れなかったとき
 *   （minify で `dummy.stack;` が落ちると必ずこうなる）。
 * - `Could not locate the bindings file`
 *   探索は走ったが `.node` が見つからなかったとき（配置漏れ）。
 */
const NATIVE_BINDING_SIGNATURES: readonly RegExp[] = [
  /Cannot read properties of undefined \(reading 'indexOf'\)/,
  /Could not locate the bindings file/,
  /better_sqlite3\.node/,
];

export function classifyDbOpenError(err: unknown): DbOpenFailureKind {
  const message = err instanceof Error ? err.message : String(err);
  return NATIVE_BINDING_SIGNATURES.some((re) => re.test(message)) ? 'native-binding' : 'other';
}

/** 原因分類に応じた診断文。native-binding のときだけ「全滅」であることを明示する。 */
export function describeDbOpenFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (classifyDbOpenError(err) === 'other') return message;
  return (
    `${message} — better-sqlite3 の native binary を解決できていません。` +
    'この失敗は開く経路そのものの故障なので、DB を読む mcp-trail ツールはすべて同じ理由で失敗します' +
    '（別 DB へのフォールバックも同じ経路を通るため無意味です）。' +
    'バンドル済み拡張なら dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node の実在と、' +
    'dist/node_modules/bindings/bindings.js が minify されていないことを確認してください。'
  );
}
