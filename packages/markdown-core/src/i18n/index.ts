import enMessages from './en.json';
import jaMessages from './ja.json';

export type MarkdownMessages = typeof jaMessages;

// ビルド時に en と ja の構造が一致することを保証する。
// ja に存在するキーが en に欠けているとここで型エラーになる。
const _enAssertion: MarkdownMessages = enMessages;
void _enAssertion;

export { enMessages,jaMessages };
