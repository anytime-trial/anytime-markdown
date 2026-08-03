/**
 * `/markdown/<topic>` の metadata。
 *
 * これらの LP は `/markdown` の下にぶら下がる。親の canonical を継承したままだと
 * 5 ページ全部が `/markdown` へ集約され、施策そのものが無効になるため、
 * 自分の URL を名乗ることを固定する。
 */

import jaMessages from "../app/[locale]/markdown/[topic]/i18n/ja.json";
import { TOPIC_SLUGS, topicPath } from "../app/[locale]/markdown/topics";

// page.tsx から LandingHeader → LocaleProvider → markdown-react-islands の barrel を辿ると
// lowlight の ESM に当たってスイートごと起動できない。metadata の検証に描画は不要なので、
// ヘッダは空のコンポーネントへ差し替える。
jest.mock("../app/[locale]/components/LandingHeader", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("next-intl/server", () => ({
  getTranslations: async (arg: string | { namespace?: string }) => {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    if (namespace !== "EditorTopics") throw new Error(`unexpected namespace: ${String(namespace)}`);
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (acc, seg) => (acc as Record<string, unknown> | undefined)?.[seg],
          jaMessages as unknown,
        ) as string;
  },
}));

import { generateMetadata, generateStaticParams } from "../app/[locale]/markdown/[topic]/page";

describe("topic page metadata", () => {
  it("generates one static param per registered topic", () => {
    expect(generateStaticParams().map((p) => p.topic).sort()).toEqual([...TOPIC_SLUGS].sort());
  });

  it.each(TOPIC_SLUGS)("points canonical and hreflang at %s itself", async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "ja", topic: slug }) });
    const path = topicPath(slug);

    expect(meta.alternates?.canonical).toBe(path);
    expect(meta.alternates?.languages).toEqual({
      ja: path,
      en: `/en${path}`,
      "x-default": path,
    });
    expect(meta.openGraph?.url).toBe(path);
  });

  it("uses the /en URL when the locale is en", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en", topic: "mermaid" }),
    });
    expect(meta.alternates?.canonical).toBe("/en/markdown/mermaid");
    expect(meta.openGraph?.url).toBe("/en/markdown/mermaid");
  });

  it.each(TOPIC_SLUGS)("gives %s its own title and description", async (slug) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "ja", topic: slug }) });

    expect(meta.title).toBe(jaMessages[slug].metaTitle);
    expect(meta.description).toBe(jaMessages[slug].metaDescription);
    // openGraph は title.template の適用対象外。素のタイトルのままだとサイト名が消える
    expect(meta.openGraph?.title).toContain(jaMessages[slug].metaTitle);
    expect(meta.openGraph?.title).toContain("Anytime Markdown");
  });

  it("returns nothing for an unregistered topic", async () => {
    // 未知の slug でも metadata を返すと、404 のページが title を持つことになる
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", topic: "unknown" }),
    });
    expect(meta).toEqual({});
  });
});
