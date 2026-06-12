/**
 * createSpreadsheetT（React 非依存 t 関数）のユニットテスト。
 * 旧 useSpreadsheetT と同一の解決ロジック（locale 正規化・ja フォールバック・変数置換）を検証する。
 */

import { createSpreadsheetT } from "../i18n/createSpreadsheetT";
import { enMessages, jaMessages } from "../i18n";

describe("createSpreadsheetT", () => {
  const jaKeys = Object.keys(jaMessages.Spreadsheet);
  const firstKey = jaKeys[0];

  it("ja ロケールで ja メッセージを返す", () => {
    const t = createSpreadsheetT("Spreadsheet", "ja");
    expect(t(firstKey)).toBe((jaMessages.Spreadsheet as Record<string, string>)[firstKey]);
  });

  it("en ロケールで en メッセージを返す", () => {
    const t = createSpreadsheetT("Spreadsheet", "en");
    expect(t(firstKey)).toBe((enMessages.Spreadsheet as Record<string, string>)[firstKey]);
  });

  it("en-US のような地域付きロケールを基底言語へ正規化する", () => {
    const t = createSpreadsheetT("Spreadsheet", "en-US");
    expect(t(firstKey)).toBe((enMessages.Spreadsheet as Record<string, string>)[firstKey]);
  });

  it("未対応ロケールは ja へフォールバックする", () => {
    const t = createSpreadsheetT("Spreadsheet", "fr");
    expect(t(firstKey)).toBe((jaMessages.Spreadsheet as Record<string, string>)[firstKey]);
  });

  it("未定義キーはキー文字列をそのまま返す", () => {
    const t = createSpreadsheetT("Spreadsheet", "ja");
    expect(t("__no_such_key__")).toBe("__no_such_key__");
  });

  it("{var} プレースホルダを置換する", () => {
    const entry = Object.entries(jaMessages.Pager as Record<string, string>).find(([, v]) =>
      v.includes("{"),
    );
    if (!entry) return; // プレースホルダ付きメッセージが無い場合はスキップ
    const [key, template] = entry;
    const varName = /\{(\w+)\}/.exec(template)?.[1] as string;
    const t = createSpreadsheetT("Pager", "ja");
    expect(t(key, { [varName]: 42 })).toBe(template.replaceAll(`{${varName}}`, "42"));
  });
});
