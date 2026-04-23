import enMessages from './en.json';
import jaMessages from './ja.json';

export type GraphMessages = typeof jaMessages;

// ビルド時に en と ja の構造が一致することを保証する。
// ja に存在するキーが en に欠けているとここで型エラーになる。
const _enAssertion: GraphMessages = enMessages;
void _enAssertion;

export { jaMessages, enMessages };
