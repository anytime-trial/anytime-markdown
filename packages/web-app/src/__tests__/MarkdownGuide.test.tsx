/**
 * /markdown の SSR 本文セクションの検証。
 *
 * 検索エンジン向けの本文なので、見た目ではなく「HTML に何が出るか」を見る。
 * 特に FAQ の JSON-LD は、表示していない Q&A を申告するとガイドライン違反に
 * なるため、表示テキストとの一致を固定する。
 */

import { render } from "@testing-library/react";
import React from "react";

import jaMessages from "../app/[locale]/markdown/i18n/ja.json";
import enMessages from "../app/[locale]/markdown/i18n/en.json";
import topicJaMessages from "../app/[locale]/markdown/[topic]/i18n/ja.json";
import topicEnMessages from "../app/[locale]/markdown/[topic]/i18n/en.json";

type Messages = typeof jaMessages;

let activeMessages: Messages = jaMessages;
let activeTopics: typeof topicJaMessages = topicJaMessages;

// 名前空間ごとに別の辞書を返す。単一の辞書で済ませると、名前空間を取り違えた実装でも
// 素通りする（EditorTopics のキーが Editor から引けてしまう）。
jest.mock("next-intl/server", () => ({
  getTranslations: async (arg: string | { namespace?: string }) => {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    const root: unknown = namespace === "EditorTopics" ? activeTopics : activeMessages;
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (acc, seg) => (acc as Record<string, unknown> | undefined)?.[seg],
          root,
        ) as string;
  },
}));

import { MarkdownGuide } from "../app/[locale]/markdown/MarkdownGuide";
import { TOPIC_SLUGS, topicPath } from "../app/[locale]/markdown/topics";

async function renderGuide(messages: Messages) {
  activeMessages = messages;
  activeTopics = messages === enMessages ? topicEnMessages : topicJaMessages;
  const element = await MarkdownGuide();
  return render(element);
}

function readFaqJsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.textContent ?? "{}") as Record<string, unknown>;
}

/**
 * 画面に出ている文字列だけを返す。
 *
 * `container.textContent` は `<script type="application/ld+json">` の中身まで拾うため、
 * そのまま「表示テキストに含まれるか」を判定すると、構造化データにしか無い文言でも
 * 一致してしまう（変異注入で実測: JSON-LD の question だけ書き換えても 6/6 通過した）。
 */
function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const script of clone.querySelectorAll("script")) {
    script.remove();
  }
  return clone.textContent ?? "";
}

describe("MarkdownGuide", () => {
  afterEach(() => {
    activeMessages = jaMessages;
    activeTopics = topicJaMessages;
  });

  it("renders all three sections as readable text", async () => {
    const { container } = await renderGuide(jaMessages);
    const text = visibleText(container);

    expect(text).toContain(jaMessages.guide.featuresHeading);
    expect(text).toContain(jaMessages.guide.howtoHeading);
    expect(text).toContain(jaMessages.guide.faqHeading);
    expect(text).toContain(jaMessages.guide.lead);
  });

  it("provides the page's only h1 and keeps the outline below it", async () => {
    const { container } = await renderGuide(jaMessages);
    const h1s = container.querySelectorAll("h1");

    // エディタ画面には見出しが無く、この本文がアウトラインの起点になる。
    // h1 が欠けると、支援技術にも検索エンジンにもページの主題が伝わらない。
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(jaMessages.guide.heading);
    // できること / 記法別 LP への導線 / 使い方 / FAQ の 4 セクションは h1 の下位に来る
    expect(container.querySelectorAll("h2")).toHaveLength(4);
  });

  it("links to every topic landing page", async () => {
    const { container } = await renderGuide(jaMessages);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

    // LP は sitemap にしか経路が無いと孤立ページになる。最も強いこのページからの
    // 内部リンクが施策の前提なので、全トピック分あることを固定する
    for (const slug of TOPIC_SLUGS) {
      expect(hrefs).toContain(topicPath(slug));
    }
  });

  it("renders every feature, step and question", async () => {
    const { container } = await renderGuide(jaMessages);
    const text = visibleText(container);

    for (const feature of Object.values(jaMessages.guide.features)) {
      expect(text).toContain(feature.title);
      expect(text).toContain(feature.body);
    }
    for (const step of Object.values(jaMessages.guide.steps)) {
      expect(text).toContain(step.title);
      expect(text).toContain(step.body);
    }
    for (const qa of Object.values(jaMessages.guide.faq)) {
      expect(text).toContain(qa.question);
      expect(text).toContain(qa.answer);
    }
  });

  it("emits FAQPage JSON-LD whose entries match the visible text", async () => {
    const { container } = await renderGuide(jaMessages);
    const jsonLd = readFaqJsonLd(container);
    const text = visibleText(container);

    expect(jsonLd["@type"]).toBe("FAQPage");
    const entries = jsonLd.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(entries).toHaveLength(Object.keys(jaMessages.guide.faq).length);

    // 構造化データにだけ存在して画面に出ていない Q&A はガイドライン違反になる
    for (const entry of entries) {
      expect(text).toContain(entry.name);
      expect(text).toContain(entry.acceptedAnswer.text);
    }
  });

  it("switches the body text with the locale", async () => {
    const { container } = await renderGuide(enMessages);
    const text = visibleText(container);

    expect(text).toContain(enMessages.guide.featuresHeading);
    expect(text).toContain(enMessages.guide.faq.signup.question);
    // 日本語の見出しが混ざらないこと（description で実際に起きた混入の再発防止）
    expect(text).not.toContain(jaMessages.guide.featuresHeading);
    expect(text).not.toContain(jaMessages.guide.faqHeading);
  });

  it("keeps the English body free of Japanese characters", async () => {
    const { container } = await renderGuide(enMessages);
    const text = visibleText(container);
    // ひらがな・カタカナ・CJK 統合漢字。混入すると /en が英語版を名乗りながら
    // 日本語を返すことになる
    expect(text).not.toMatch(/[぀-ヿ一-龯]/);
  });

  it("does not hide the text from users", async () => {
    const { container } = await renderGuide(jaMessages);
    const section = container.querySelector("section");

    expect(section).not.toBeNull();
    // 隠しテキストはクローキングにあたる。属性・インラインスタイルでの隠蔽が
    // 混入していないことを固定する
    const html = container.innerHTML;
    expect(html).not.toContain("display:none");
    expect(html).not.toContain("visibility:hidden");
    expect(container.querySelector("[hidden]")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
