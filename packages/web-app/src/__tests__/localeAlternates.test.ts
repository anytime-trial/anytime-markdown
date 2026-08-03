import { buildAlternates, localeHref, toLocale } from "../lib/localeAlternates";

describe("localeHref", () => {
  it("keeps the default locale unprefixed", () => {
    expect(localeHref("/markdown", "ja")).toBe("/markdown");
    expect(localeHref("/", "ja")).toBe("/");
  });

  it("prefixes non-default locales", () => {
    expect(localeHref("/markdown", "en")).toBe("/en/markdown");
    expect(localeHref("/report/my-post", "en")).toBe("/en/report/my-post");
  });

  it("does not leave a trailing slash on the locale root", () => {
    expect(localeHref("/", "en")).toBe("/en");
  });
});

describe("buildAlternates", () => {
  it("points canonical at the current locale", () => {
    expect(buildAlternates("/markdown", "ja")?.canonical).toBe("/markdown");
    expect(buildAlternates("/markdown", "en")?.canonical).toBe("/en/markdown");
  });

  it("cross-links both locales regardless of which one is current", () => {
    const fromJa = buildAlternates("/privacy", "ja")?.languages;
    const fromEn = buildAlternates("/privacy", "en")?.languages;

    expect(fromJa).toEqual({ ja: "/privacy", en: "/en/privacy", "x-default": "/privacy" });
    expect(fromEn).toEqual(fromJa);
  });

  it("points x-default at the default locale", () => {
    expect(buildAlternates("/report", "en")?.languages?.["x-default"]).toBe("/report");
  });
});

describe("toLocale", () => {
  it("passes through supported locales", () => {
    expect(toLocale("en")).toBe("en");
    expect(toLocale("ja")).toBe("ja");
  });

  it("falls back to the default locale for unknown or missing values", () => {
    expect(toLocale("fr")).toBe("ja");
    expect(toLocale(undefined)).toBe("ja");
  });
});
