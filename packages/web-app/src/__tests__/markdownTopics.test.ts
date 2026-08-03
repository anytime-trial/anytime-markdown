/**
 * トピックレジストリと、それに依存する周辺（i18n・sitemap・ルーティング）の契約。
 *
 * トピックを増やしたときに「ページは出るが sitemap に無い」「ja にしかキーが無い」と
 * いった片側だけの追加が起きるため、レジストリを起点に双方向で突合する。
 */

import enMessages from "../app/[locale]/markdown/[topic]/i18n/en.json";
import jaMessages from "../app/[locale]/markdown/[topic]/i18n/ja.json";
import { isTopicSlug, TOPICS, TOPIC_SLUGS, topicPath } from "../app/[locale]/markdown/topics";

type Dict = Record<string, unknown>;

/** 入れ子のキーをドット区切りの集合へ潰す（葉だけを見る） */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Dict).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("topic registry", () => {
  it("accepts only registered slugs", () => {
    for (const slug of TOPIC_SLUGS) expect(isTopicSlug(slug)).toBe(true);
    // `[topic]` は任意の文字列を受け取る。ここが緩むと薄いページが無限に生える
    for (const unknown of ["unknown", "", "Mermaid", "mermaid/", "../markdown"]) {
      expect(isTopicSlug(unknown)).toBe(false);
    }
  });

  it("builds paths under /markdown", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(topicPath(slug)).toBe(`/markdown/${slug}`);
    }
  });

  it("has no duplicate slug", () => {
    expect(new Set(TOPIC_SLUGS).size).toBe(TOPIC_SLUGS.length);
  });
});

describe("topic i18n", () => {
  it("has the same key set in ja and en", () => {
    // 片方だけにキーを足すと、もう片方は実行時に MISSING_MESSAGE を出す
    expect(flattenKeys(enMessages).sort()).toEqual(flattenKeys(jaMessages).sort());
  });

  it.each(TOPIC_SLUGS)("covers every registry key of %s in both locales", (slug) => {
    const topic = TOPICS[slug];
    for (const messages of [jaMessages, enMessages]) {
      const entry = (messages as unknown as Dict)[slug] as Dict;
      expect(entry).toBeDefined();

      for (const field of ["metaTitle", "metaDescription", "socialDescription", "heading", "lead", "linkLabel"]) {
        expect(typeof entry[field]).toBe("string");
        expect((entry[field] as string).length).toBeGreaterThan(0);
      }
      for (const sample of topic.samples) {
        expect((entry.samples as Dict)[sample.key]).toBeDefined();
      }
      for (const key of topic.featureKeys) {
        expect((entry.features as Dict)[key]).toBeDefined();
      }
      for (const key of topic.faqKeys) {
        expect((entry.faq as Dict)[key]).toBeDefined();
      }
    }
  });

  it("defines no topic block that the registry does not know", () => {
    const known = new Set<string>([...TOPIC_SLUGS, "common"]);
    for (const key of Object.keys(jaMessages)) {
      // 消し忘れた翻訳はどのページにも出ないまま残り、いずれ実装と食い違う
      expect(known.has(key)).toBe(true);
    }
  });

  it("keeps the meta description within the length search results show", () => {
    for (const messages of [jaMessages, enMessages]) {
      for (const slug of TOPIC_SLUGS) {
        const entry = (messages as unknown as Dict)[slug] as Dict;
        expect((entry.metaDescription as string).length).toBeLessThanOrEqual(160);
      }
    }
  });
});
