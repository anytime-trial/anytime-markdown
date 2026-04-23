import enMessages from "./en.json";
import jaMessages from "./ja.json";

export type SpreadsheetViewerMessages = typeof jaMessages;

/** ja と en の構造が一致することを型で保証 */
const _enAssertion: SpreadsheetViewerMessages = enMessages;
void _enAssertion;

export { enMessages, jaMessages };
