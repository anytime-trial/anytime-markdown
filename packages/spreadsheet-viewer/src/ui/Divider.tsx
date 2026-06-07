import { injectSpreadsheetUiStyles } from "./injectStyles";

/** MUI Divider の置換（メニュー内の区切り線）。 */
export function Divider() {
  injectSpreadsheetUiStyles();
  return <hr className="sv-divider" />;
}
