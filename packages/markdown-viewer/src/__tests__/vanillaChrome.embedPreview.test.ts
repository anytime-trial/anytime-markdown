/**
 * vanillaChrome.embedPreview.test.ts — createEmbedPreview / embedData / embedProviders のユニットテスト。
 *
 * jsdom 環境での vanilla DOM テスト。React/JSX は使わない。
 * islands テスト（OgpCardView / TwitterEmbedView / EmbedNodeView / useEmbedData）の
 * 検証観点を vanilla へ移植する。
 *
 * jsdom の罠回避（既存 vanillaChrome テストの知見）:
 * - getComputedStyle で CSS カスタムプロパティは取得できないため検証しない。
 * - el.style.cssText / getAttribute / textContent で属性・テキストを確認する。
 * - 非同期フェッチは Promise 解決を待つために flushPromises() を使う。
 * - EmbedCache / embedSeenStore は localStorage 依存のため各テスト前に clear する。
 */

import { createEmbedPreview } from "../components-vanilla/embed/createEmbedPreview";
import { setEmbedProviders, getEmbedProviders } from "../embedProviders";
import { createEmbedFetchController, createUpdateCheckController } from "../components-vanilla/embed/embedData";
import type { EmbedProviders, OgpData, OembedData } from "../types/embedProvider";

// ===== ヘルパー =====

/** Promise キューを全て解決させる */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeProviders(overrides: Partial<EmbedProviders> = {}): EmbedProviders {
  return {
    fetchOgp: jest.fn().mockResolvedValue({
      url: "https://example.com",
      title: "Example Title",
      description: "A description",
      image: null,
      siteName: null,
      favicon: null,
    } satisfies OgpData),
    fetchOembed: jest.fn().mockResolvedValue({
      url: "https://twitter.com/u/status/1",
      provider: "twitter",
      html: '<blockquote class="twitter-tweet"><p>hi</p></blockquote>',
      authorName: "user",
    } satisfies OembedData),
    fetchRss: jest.fn().mockResolvedValue({ guid: "g1", pubDate: "2024-01-01", title: "RSS Title" }),
    ...overrides,
  };
}

// ===== embedProviders レジストリ =====

describe("embedProviders", () => {
  afterEach(() => {
    setEmbedProviders(null);
  });

  test("初期状態は null", () => {
    setEmbedProviders(null);
    expect(getEmbedProviders()).toBeNull();
  });

  test("setEmbedProviders で注入・取得できる", () => {
    const p = makeProviders();
    setEmbedProviders(p);
    expect(getEmbedProviders()).toBe(p);
  });

  test("null を渡すとリセットされる", () => {
    setEmbedProviders(makeProviders());
    setEmbedProviders(null);
    expect(getEmbedProviders()).toBeNull();
  });
});

// ===== createEmbedFetchController =====

describe("createEmbedFetchController", () => {
  beforeEach(() => localStorage.clear());

  test("初期状態 loading=true", () => {
    const ctrl = createEmbedFetchController<OgpData>();
    expect(ctrl.getState().loading).toBe(true);
    expect(ctrl.getState().data).toBeNull();
    expect(ctrl.getState().error).toBeNull();
  });

  test("OGP フェッチ成功で data がセットされる", async () => {
    const providers = makeProviders();
    const ctrl = createEmbedFetchController<OgpData>();
    const states: Array<typeof ctrl extends { getState(): infer S } ? S : never> = [];
    ctrl.subscribe((s) => states.push(s));

    ctrl.fetch("https://a.example", "ogp", providers.fetchOgp);
    await flushPromises();

    const last = states.at(-1);
    expect(last?.loading).toBe(false);
    expect(last?.data?.title).toBe("Example Title");
    expect(providers.fetchOgp).toHaveBeenCalledWith("https://a.example");
  });

  test("フェッチ失敗で error がセットされる", async () => {
    const providers = makeProviders({
      fetchOgp: jest.fn().mockRejectedValue(new Error("boom")),
    });
    const ctrl = createEmbedFetchController<OgpData>();
    const states: Array<{ loading: boolean; data: OgpData | null; error: string | null }> = [];
    ctrl.subscribe((s) => states.push(s));

    ctrl.fetch("https://err.example", "ogp", providers.fetchOgp);
    await flushPromises();

    const last = states.at(-1);
    expect(last?.loading).toBe(false);
    expect(last?.error).toBe("boom");
    expect(last?.data).toBeNull();
  });

  test("cancel() 後は subscriber が呼ばれない", async () => {
    const providers = makeProviders();
    const ctrl = createEmbedFetchController<OgpData>();
    const states: unknown[] = [];
    ctrl.subscribe((s) => states.push(s));

    ctrl.fetch("https://cancel.example", "ogp", providers.fetchOgp);
    ctrl.cancel();
    await flushPromises();

    // cancel 前の loading 初期化だけが起こり、subscriber への通知はなし
    expect(states).toHaveLength(0);
  });

  test("キャッシュ hit 時に fetcher を再呼び出ししない", async () => {
    const providers = makeProviders();
    const ctrl1 = createEmbedFetchController<OgpData>();
    ctrl1.fetch("https://cached2.example", "ogp", providers.fetchOgp);
    await flushPromises();

    // 2 回目のコントローラ — キャッシュ hit
    const ctrl2 = createEmbedFetchController<OgpData>();
    const states: unknown[] = [];
    ctrl2.subscribe((s) => states.push(s));
    ctrl2.fetch("https://cached2.example", "ogp", providers.fetchOgp);

    // キャッシュ hit は同期的に notify される
    expect(states).toHaveLength(1);
    expect(providers.fetchOgp).toHaveBeenCalledTimes(1);
  });
});

// ===== createUpdateCheckController =====

describe("createUpdateCheckController", () => {
  beforeEach(() => localStorage.clear());

  test("初期状態 status=loading", () => {
    const ctrl = createUpdateCheckController();
    expect(ctrl.getState().status).toBe("loading");
  });

  test("cancel() 後は状態が変化しない", async () => {
    const providers = makeProviders({
      fetchRss: jest.fn().mockResolvedValue({ guid: "g1", pubDate: "2024-01-01", title: "T" }),
    });
    const ctrl = createUpdateCheckController();
    const states: unknown[] = [];
    ctrl.subscribe((s) => states.push(s));

    const ogpData: OgpData = { url: "https://x.example", title: "T", description: null, image: null, siteName: null, favicon: null };
    const baseline = { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false };

    ctrl.check("https://x.example", ogpData, providers, baseline, jest.fn());
    ctrl.cancel();
    await flushPromises();

    expect(states).toHaveLength(0);
  });
});

// ===== createEmbedPreview — URL 分類ディスパッチ =====

describe("createEmbedPreview — URL ディスパッチ", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    setEmbedProviders(null);
  });

  afterEach(() => {
    container.remove();
    setEmbedProviders(null);
  });

  test("body が空の場合はプレースホルダ表示", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "", undefined, jest.fn());
    expect(container.textContent).toContain("有効な URL");
    handle.destroy();
  });

  test("分類不能 URL はプレースホルダ表示", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "not-a-url", undefined, jest.fn());
    expect(container.textContent).toContain("埋め込めません");
    handle.destroy();
  });

  test("providers 未設定で Twitter URL はプレースホルダ", () => {
    setEmbedProviders(null);
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://twitter.com/u/status/12345", undefined, jest.fn());
    expect(container.textContent).toContain("プロバイダ");
    handle.destroy();
  });

  test("providers 未設定で OGP URL はプレースホルダ", () => {
    setEmbedProviders(null);
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://example.com/article", undefined, jest.fn());
    expect(container.textContent).toContain("プロバイダ");
    handle.destroy();
  });

  test("YouTube URL は iframe を含む要素を描画", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", undefined, jest.fn());
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("youtube-nocookie.com");
    handle.destroy();
  });

  test("YouTube compact は iframe ではなくリンクを描画", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed compact", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", undefined, jest.fn());
    expect(container.querySelector("iframe")).toBeNull();
    const a = container.querySelector("a");
    expect(a?.href).toContain("youtube.com/watch");
    handle.destroy();
  });

  test("Spotify URL は iframe を含む要素を描画", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", undefined, jest.fn());
    const iframe = container.querySelector("iframe");
    expect(iframe?.src).toContain("spotify.com/embed");
    handle.destroy();
  });

  test("Figma URL は iframe を含む要素を描画", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://www.figma.com/file/abc123/MyDesign", undefined, jest.fn());
    const iframe = container.querySelector("iframe");
    expect(iframe?.src).toContain("figma.com/embed");
    handle.destroy();
  });

  test("Drawio URL は iframe を含む要素を描画", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://app.diagrams.net/mydiagram.xml", undefined, jest.fn());
    const iframe = container.querySelector("iframe");
    expect(iframe?.src).toContain("viewer.diagrams.net");
    handle.destroy();
  });
});

// ===== OGP カード描画 =====

describe("createEmbedPreview — OGP カード", () => {
  let container: HTMLDivElement;
  const OGP_URL = "https://example.com/article";

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    setEmbedProviders(null);
  });

  test("card variant: OGP fetch 成功後にタイトル・ドメイン表示", async () => {
    const providers = makeProviders({
      fetchOgp: jest.fn().mockResolvedValue({
        url: OGP_URL,
        title: "Card Title Here",
        description: "desc",
        image: null,
        siteName: null,
        favicon: null,
      } satisfies OgpData),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", OGP_URL, undefined, jest.fn());
    await flushPromises();

    expect(container.textContent).toContain("Card Title Here");
    expect(container.textContent).toContain("example.com");
    handle.destroy();
  });

  test("compact variant: 1 行で表示", async () => {
    const providers = makeProviders({
      fetchOgp: jest.fn().mockResolvedValue({
        url: OGP_URL,
        title: "Compact Title",
        description: null,
        image: null,
        siteName: null,
        favicon: null,
      } satisfies OgpData),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed compact", OGP_URL, undefined, jest.fn());
    await flushPromises();

    expect(container.textContent).toContain("Compact Title");
    expect(container.textContent).toContain("example.com");
    handle.destroy();
  });

  test("ロード中にスケルトンが表示される", () => {
    const providers = makeProviders({
      // 解決しない Promise で pending 状態を維持
      fetchOgp: jest.fn().mockReturnValue(new Promise(() => { /* never */ })),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", OGP_URL, undefined, jest.fn());

    const skeleton = container.querySelector(".am-vanilla-skeleton");
    expect(skeleton).not.toBeNull();
    handle.destroy();
  });

  test("destroy() でコンテナがクリアされる", async () => {
    const providers = makeProviders();
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", OGP_URL, undefined, jest.fn());
    await flushPromises();

    handle.destroy();
    expect(container.innerHTML).toBe("");
  });
});

// ===== Twitter ビュー =====

describe("createEmbedPreview — Twitter", () => {
  let container: HTMLDivElement;
  const TWEET_URL = "https://twitter.com/u/status/12345";

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    setEmbedProviders(null);
  });

  test("card variant: oEmbed 成功後に twitter-tweet が描画される", async () => {
    const providers = makeProviders({
      fetchOembed: jest.fn().mockResolvedValue({
        url: TWEET_URL,
        provider: "twitter",
        html: '<blockquote class="twitter-tweet"><p>hi</p></blockquote>',
        authorName: "user",
      } satisfies OembedData),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", TWEET_URL, undefined, jest.fn());
    await flushPromises();

    expect(container.querySelector(".twitter-tweet")).not.toBeNull();
    handle.destroy();
  });

  test("fetchOembed 失敗でフォールバックリンク表示", async () => {
    const providers = makeProviders({
      fetchOembed: jest.fn().mockRejectedValue(new Error("boom")),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", TWEET_URL, undefined, jest.fn());
    await flushPromises();

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe(TWEET_URL);
    handle.destroy();
  });

  test("compact variant: 著者名と抜粋が表示される", async () => {
    const providers = makeProviders({
      fetchOembed: jest.fn().mockResolvedValue({
        url: TWEET_URL,
        provider: "twitter",
        html: "<blockquote><p>Hello world tweet</p></blockquote>",
        authorName: "testuser",
      } satisfies OembedData),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed compact", TWEET_URL, undefined, jest.fn());
    await flushPromises();

    expect(container.textContent).toContain("@testuser");
    handle.destroy();
  });

  test("destroy() で非同期通知がキャンセルされる", async () => {
    let resolveOembed!: (v: OembedData) => void;
    const providers = makeProviders({
      fetchOembed: jest.fn().mockReturnValue(
        new Promise<OembedData>((res) => { resolveOembed = res; }),
      ),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", TWEET_URL, undefined, jest.fn());
    handle.destroy();

    // destroy 後に解決しても DOM を汚染しない
    resolveOembed({
      url: TWEET_URL,
      provider: "twitter",
      html: "<blockquote>late</blockquote>",
      authorName: null,
    });
    await flushPromises();

    expect(container.innerHTML).toBe("");
  });
});

// ===== widthOverride / info string =====

describe("createEmbedPreview — widthOverride / info string", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    setEmbedProviders(null);
  });

  test("widthOverride が YouTube iframe ラッパに適用される", () => {
    const handle = createEmbedPreview(container);
    handle.render(
      "embed card",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "400px",
      jest.fn(),
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper?.style.width).toBe("400px");
    handle.destroy();
  });

  test("compact variant では widthOverride が無視される（YouTube）", () => {
    const handle = createEmbedPreview(container);
    handle.render(
      "embed compact",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "400px",
      jest.fn(),
    );
    // compact バーは width: auto / max-width: 720px（CSS クラス）
    const a = container.querySelector("a");
    expect(a?.className).toContain("am-embed-bar");
    handle.destroy();
  });

  test("同一 key で render しても再マウントしない（idempotent）", () => {
    const handle = createEmbedPreview(container);
    handle.render("embed card", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", undefined, jest.fn());
    const child1 = container.firstChild;
    handle.render("embed card", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", undefined, jest.fn());
    const child2 = container.firstChild;
    expect(child1).toBe(child2);
    handle.destroy();
  });
});

// ===== RSS 更新バッジ（provider 注入 + RSS チェック） =====

describe("createEmbedPreview — RSS 更新バッジ", () => {
  let container: HTMLDivElement;
  const OGP_URL = "https://badge.example/article";

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    setEmbedProviders(null);
  });

  test("provider が直接 fetch フォールバックとして機能する", async () => {
    // providers を注入して OGP フェッチが成功することを確認
    const providers = makeProviders({
      fetchOgp: jest.fn().mockResolvedValue({
        url: OGP_URL,
        title: "Badge Test",
        description: null,
        image: null,
        siteName: null,
        favicon: null,
      } satisfies OgpData),
      fetchRss: jest.fn().mockRejectedValue(new Error("no rss")),
    });
    setEmbedProviders(providers);

    const handle = createEmbedPreview(container);
    handle.render("embed card", OGP_URL, undefined, jest.fn());
    await flushPromises();
    await flushPromises(); // RSS チェックの 2 段階非同期を待つ

    expect(container.textContent).toContain("Badge Test");
    handle.destroy();
  });
});
