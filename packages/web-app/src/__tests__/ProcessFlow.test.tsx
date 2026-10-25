/**
 * ランディングの開発プロセス図（ProcessFlow）の検証。
 *
 * 図はテスト実施の指針と対応づけて読ませるため、「受け入れ試験の内訳」「ループ A の前提」
 * 「ループ B の差し戻し」が表示されることと、ja / en の辞書がキーを揃えていることを固定する。
 */

import { render, screen, within } from "@testing-library/react";
import React from "react";

import enMessages from "../app/[locale]/press/i18n/en.json";
import jaMessages from "../app/[locale]/press/i18n/ja.json";

type ProcessMessages = typeof jaMessages.process;

let activeMessages: ProcessMessages = jaMessages.process;

// 名前空間を取り違えた実装を素通りさせないよう、press.process 以外は undefined を返す
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    namespace === "press.process" ? (activeMessages as Record<string, string>)[key] : undefined,
}));

// jsdom は CSS モジュールを評価しないため、クラス名をキー名のまま返す
jest.mock("../app/[locale]/press/press.module.css", () => new Proxy({}, { get: (_t, key) => key }));

import { ProcessFlow } from "../app/[locale]/press/components/ProcessFlow";

describe("ProcessFlow", () => {
  afterEach(() => {
    activeMessages = jaMessages.process;
  });

  it("受け入れ試験の中に、自動テストの内容確認 → ユーザーテストの順で 2 段を表示する", () => {
    render(<ProcessFlow />);
    const acceptance = screen.getByText(jaMessages.process.loopB1).closest("li");
    expect(acceptance).not.toBeNull();
    const subSteps = within(acceptance as HTMLElement).getAllByRole("listitem");
    expect(subSteps.map((li) => li.textContent)).toEqual([
      jaMessages.process.loopB1a,
      jaMessages.process.loopB1b,
    ]);
  });

  it("ループ A の前提（テスト範囲の事前定義）とループ B の差し戻しを表示する", () => {
    render(<ProcessFlow />);
    expect(screen.getByText(jaMessages.process.loopANote)).toBeTruthy();
    expect(screen.getByText(jaMessages.process.loopBReturn)).toBeTruthy();
  });

  it("英語の辞書でも同じ内訳を表示する", () => {
    activeMessages = enMessages.process;
    render(<ProcessFlow />);
    expect(screen.getByText(enMessages.process.loopB1a)).toBeTruthy();
    expect(screen.getByText(enMessages.process.loopB1b)).toBeTruthy();
    expect(screen.getByText(enMessages.process.loopANote)).toBeTruthy();
    expect(screen.getByText(enMessages.process.loopBReturn)).toBeTruthy();
  });

  it.each([
    ["ja", jaMessages.process],
    ["en", enMessages.process],
  ])("%s: 図の名前は短くし、詳しい説明は figcaption を aria-describedby で結ぶ", (_lang, messages) => {
    activeMessages = messages;
    render(<ProcessFlow />);
    const figure = screen.getByRole("figure");
    // 長い aria-label は支援技術で切り詰め・冗長な読み上げになる。図中の可視テキストと重複させない
    expect((figure.getAttribute("aria-label") ?? "").length).toBeLessThanOrEqual(80);
    const describedBy = figure.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(messages.caption);
  });

  it("ja と en の process 辞書はキーが一致する", () => {
    expect(Object.keys(enMessages.process).sort()).toEqual(Object.keys(jaMessages.process).sort());
  });
});
