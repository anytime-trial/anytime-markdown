import { createTranslator, detectLocale, resolveLocale } from "../i18n";

const messages = {
  ja: { Panel: { title: "タイトル", greet: "こんにちは {name} さん" } },
  en: { Panel: { title: "Title", greet: "Hello {name}" } },
};

describe("resolveLocale", () => {
  it("ja 系のタグを ja に解決する", () => {
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("ja-JP")).toBe("ja");
  });

  it("ja 以外を en に解決する（既定方針）", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
  });
});

describe("detectLocale", () => {
  it("navigator.language を見て解決する", () => {
    const spy = jest.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
    expect(detectLocale()).toBe("ja");
    spy.mockReturnValue("de-DE");
    expect(detectLocale()).toBe("en");
    spy.mockRestore();
  });
});

describe("createTranslator", () => {
  it("指定 locale の namespace からキーを引く", () => {
    const t = createTranslator({ messagesByLocale: messages, namespace: "Panel", locale: "en" });
    expect(t("title")).toBe("Title");
  });

  it("{var} をすべて置換する", () => {
    const t = createTranslator({ messagesByLocale: messages, namespace: "Panel", locale: "ja" });
    expect(t("greet", { name: "太郎" })).toBe("こんにちは 太郎 さん");
  });

  it("数値の vars を文字列化する", () => {
    const t = createTranslator({
      messagesByLocale: { ja: { Panel: { n: "{count} 件" } }, en: { Panel: { n: "{count} items" } } },
      namespace: "Panel",
      locale: "ja",
    });
    expect(t("n", { count: 3 })).toBe("3 件");
  });

  it("対象 locale に無いキーは fallback locale から引く", () => {
    const partial = {
      ja: { Panel: { title: "タイトル", only: "日本語のみ" } },
      en: { Panel: { title: "Title" } },
    };
    const t = createTranslator({ messagesByLocale: partial, namespace: "Panel", locale: "en" });
    expect(t("only")).toBe("日本語のみ");
  });

  it("どちらにも無いキーはキー自身を返す", () => {
    const t = createTranslator({ messagesByLocale: messages, namespace: "Panel", locale: "ja" });
    expect(t("missing")).toBe("missing");
  });

  it("locale 省略時は detectLocale の結果を使う", () => {
    const spy = jest.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    const t = createTranslator({ messagesByLocale: messages, namespace: "Panel" });
    expect(t("title")).toBe("Title");
    spy.mockRestore();
  });

  it("resolveLocale を差し替えられる（spreadsheet-viewer の ja 既定方針）", () => {
    const t = createTranslator({
      messagesByLocale: messages,
      namespace: "Panel",
      locale: "fr",
      resolveLocale: (raw) => (raw.split("-")[0] === "en" ? "en" : "ja"),
    });
    expect(t("title")).toBe("タイトル");
  });

  it("fallbackLocale を差し替えられる", () => {
    const partial = {
      ja: { Panel: { title: "タイトル" } },
      en: { Panel: { title: "Title", only: "en only" } },
    };
    const t = createTranslator({
      messagesByLocale: partial,
      namespace: "Panel",
      locale: "ja",
      fallbackLocale: "en",
    });
    expect(t("only")).toBe("en only");
  });

  it("namespace が存在しなくてもキー自身を返して落ちない", () => {
    const t = createTranslator({
      messagesByLocale: { ja: {}, en: {} } as unknown as typeof messages,
      namespace: "Panel",
      locale: "ja",
    });
    expect(t("title")).toBe("title");
  });
});
