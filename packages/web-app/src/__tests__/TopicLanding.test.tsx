/**
 * `/markdown/<topic>` LP の検証。
 *
 * 検索エンジン向けのページなので、見た目ではなく「HTML に何が出るか」を見る。
 * 特に構造化データは、表示していない内容を申告するとガイドライン違反になるため、
 * 表示テキストとの一致を固定する。
 */

import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";

import enMessages from "../app/[locale]/markdown/[topic]/i18n/en.json";
import jaMessages from "../app/[locale]/markdown/[topic]/i18n/ja.json";
import { TOPICS, TOPIC_SLUGS, topicPath, type TopicSlug } from "../app/[locale]/markdown/topics";

type Messages = typeof jaMessages;

let activeMessages: Messages = jaMessages;

jest.mock("next-intl/server", () => ({
  getTranslations: async (arg: string | { namespace?: string }) => {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    if (namespace !== "EditorTopics") {
      throw new Error(`unexpected namespace: ${String(namespace)}`);
    }
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (acc, seg) => (acc as Record<string, unknown> | undefined)?.[seg],
          activeMessages as unknown,
        ) as string;
  },
}));

import { TopicLanding } from "../app/[locale]/markdown/[topic]/TopicLanding";

async function renderTopic(slug: TopicSlug, messages: Messages = jaMessages) {
  activeMessages = messages;
  const element = await TopicLanding({ slug, locale: messages === enMessages ? "en" : "ja" });
  return render(element);
}

/**
 * 画面に出ている文字列だけを返す。`container.textContent` は JSON-LD の中身まで拾うため、
 * そのままでは「構造化データにしか無い文言」でも一致してしまう。
 */
function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const script of clone.querySelectorAll("script")) script.remove();
  return clone.textContent ?? "";
}

function readJsonLd(container: HTMLElement, type: string): Record<string, unknown> {
  for (const script of container.querySelectorAll('script[type="application/ld+json"]')) {
    const parsed = JSON.parse(script.textContent ?? "{}") as Record<string, unknown>;
    if (parsed["@type"] === type) return parsed;
  }
  throw new Error(`no JSON-LD of type ${type}`);
}

/** JSON の断片が持つ `title`/`body` などを、バックティックを外した素のテキストにする */
function plain(text: string): string {
  return text.replaceAll("`", "");
}

describe("TopicLanding", () => {
  afterEach(() => {
    activeMessages = jaMessages;
  });

  it.each(TOPIC_SLUGS)("renders %s as a single-h1 document", async (slug) => {
    const { container } = await renderTopic(slug);
    const h1s = container.querySelectorAll("h1");

    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(jaMessages[slug].heading);
    // 書き方 / できること / FAQ / ほかの記法
    expect(container.querySelectorAll("h2")).toHaveLength(4);
    expect(container.querySelectorAll("h3").length).toBeGreaterThan(0);
  });

  it.each(TOPIC_SLUGS)("renders every sample, feature and question of %s", async (slug) => {
    const { container } = await renderTopic(slug);
    const text = visibleText(container);
    const topic = TOPICS[slug];
    const messages = jaMessages[slug];

    for (const sample of topic.samples) {
      const entry = messages.samples[sample.key as keyof typeof messages.samples] as {
        caption: string;
        note: string;
      };
      expect(text).toContain(entry.caption);
      expect(text).toContain(plain(entry.note));
      // 記法そのものが本文に出ていなければ、解説として成立しない
      expect(text).toContain(sample.code);
    }
    for (const key of topic.featureKeys) {
      const entry = messages.features[key as keyof typeof messages.features] as {
        title: string;
        body: string;
      };
      expect(text).toContain(entry.title);
      expect(text).toContain(plain(entry.body));
    }
    for (const key of topic.faqKeys) {
      const entry = messages.faq[key as keyof typeof messages.faq] as {
        question: string;
        answer: string;
      };
      expect(text).toContain(entry.question);
      expect(text).toContain(entry.answer);
    }
  });

  it.each(TOPIC_SLUGS)("keeps %s FAQ structured data equal to the visible Q&A", async (slug) => {
    const { container } = await renderTopic(slug);
    const jsonLd = readJsonLd(container, "FAQPage");
    const text = visibleText(container);

    const entries = jsonLd.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(entries).toHaveLength(TOPICS[slug].faqKeys.length);
    for (const entry of entries) {
      expect(text).toContain(entry.name);
      expect(text).toContain(entry.acceptedAnswer.text);
    }
  });

  it("emits a breadcrumb whose entries are absolute and ordered", async () => {
    const { container } = await renderTopic("mermaid");
    const jsonLd = readJsonLd(container, "BreadcrumbList");
    const items = jsonLd.itemListElement as { position: number; name: string; item: string }[];

    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    for (const item of items) {
      // 相対パスだと検索エンジンが解決先を決められない
      expect(item.item).toMatch(/^https?:\/\//);
    }
    expect(items[2].item).toMatch(/\/markdown\/mermaid$/);
    expect(items[2].name).toBe(jaMessages.mermaid.linkLabel);
  });

  it("emits the en breadcrumb under the /en prefix", async () => {
    const { container } = await renderTopic("mermaid", enMessages);
    const items = readJsonLd(container, "BreadcrumbList").itemListElement as { item: string }[];

    // ja 用の URL を出すと、英語版が日本語ページの一部として申告される
    expect(items[2].item).toMatch(/\/en\/markdown\/mermaid$/);
  });

  it("sends visitors to the editor and to the other topics", async () => {
    const { container } = await renderTopic("mermaid");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));

    expect(hrefs).toContain("/markdown");
    for (const other of TOPIC_SLUGS.filter((s) => s !== "mermaid")) {
      expect(hrefs).toContain(topicPath(other));
    }
    // 自分自身へのリンクは置かない
    expect(hrefs).not.toContain(topicPath("mermaid"));
  });

  it("keeps the English body free of Japanese characters", async () => {
    for (const slug of TOPIC_SLUGS) {
      const { container, unmount } = await renderTopic(slug, enMessages);
      // 混入すると /en が英語版を名乗りながら日本語を返すことになる
      expect(visibleText(container)).not.toMatch(/[぀-ヿ一-龯]/);
      unmount();
    }
  });

  it("passes no component to a client component from the server component", () => {
    // MUI の `component={Link}` を server component に書くと、サーバー描画が
    // 「Functions cannot be passed directly to Client Components」で落ちる。
    // 落ちても Suspense のフォールバックへ縮退してクライアントで描き直されるため、
    // jsdom のこのテストは全部通り、画面も正しく見え、サーバーが返す HTML からだけ
    // 本文が消える（実測: h1/h2/h3 が 0 個）。SSR 本文が目的のページでは機能の消失なので、
    // ソースの形で禁じる。境界が要るときは TopicCtaButton のように 'use client' を挟む。
    const source = readFileSync(
      join(__dirname, "../app/[locale]/markdown/[topic]/TopicLanding.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/component=\{[A-Z]/);
  });

  it("does not hide the text from users", async () => {
    const { container } = await renderTopic("mermaid");

    // 隠しテキストはクローキングにあたる
    expect(container.innerHTML).not.toContain("display:none");
    expect(container.innerHTML).not.toContain("visibility:hidden");
    expect(container.querySelector("[hidden]")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
