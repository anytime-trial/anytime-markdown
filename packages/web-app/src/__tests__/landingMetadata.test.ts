import enMessages from "../app/[locale]/press/i18n/en.json";
import jaMessages from "../app/[locale]/press/i18n/ja.json";

jest.mock("../app/[locale]/press/PressBody", () => ({
  PressBody: () => null,
}));

jest.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "ja" | "en"; namespace: string }) => {
    if (namespace !== "press") throw new Error(`unexpected namespace: ${namespace}`);
    const messages = locale === "ja" ? jaMessages : enMessages;
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (acc, segment) => (acc as Record<string, unknown> | undefined)?.[segment],
          messages,
        ) as string;
  },
}));

import { generateMetadata } from "../app/[locale]/page";

describe("landing page metadata", () => {
  const expected = {
    ja: {
      title: "Anytime Markdown — ブラウザで使える Markdown エディタ | Caravan Press",
      description:
        "ブラウザだけで動く WYSIWYG Markdown エディタ。Mermaid・PlantUML・KaTeX・差分ハイライト・Git 連携対応。登録不要で今すぐ使える、仕様駆動開発（SDD）のための Markdown エディタ。",
    },
    en: {
      title: "Caravan Press · Anytime Markdown — Browser Markdown Editor",
      description:
        "A newspaper-press dispatch of Anytime Markdown — slow writing, by design. Browser-only markdown editor for Spec-Driven Development.",
    },
  } as const;

  it.each(["ja", "en"] as const)("uses localized metadata and alternates for %s", async (locale) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });

    expect(metadata.title).toEqual({ absolute: expected[locale].title });
    expect(metadata.description).toBe(expected[locale].description);
    expect(metadata.openGraph?.title).toBe(expected[locale].title);
    expect(metadata.openGraph?.description).toBe(expected[locale].description);
    expect(metadata.twitter?.title).toBe(expected[locale].title);
    expect(metadata.twitter?.description).toBe(expected[locale].description);
    expect(metadata.alternates).toBeDefined();
  });
});
