/**
 * embedPreviewMount.ts — embed プレビューの React マウント（反転の限定許容）テスト。
 * react-dom/client と viewer の embed ヘルパをモックする。
 */

const mockRender = jest.fn();
const mockUnmount = jest.fn();
jest.mock("react-dom/client", () => ({
  createRoot: jest.fn(() => ({ render: mockRender, unmount: mockUnmount })),
}));
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  EmbedNodeView: function EmbedNodeView() { return null; },
  parseEmbedInfoString: jest.fn(),
  buildEmbedInfoString: jest.fn(
    (variant: string, width: string | null) => `embed ${variant}${width ? ` ${width}` : ""}`,
  ),
  DEFAULT_EMBED_BASELINE: { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false },
}));

import {
  buildEmbedBaselineLanguage,
  buildEmbedWidthLanguage,
  getEmbedStoredWidth,
  isEmbedResizable,
  mountEmbedPreview,
} from "../components/codeblock/embedPreviewMount";
import { parseEmbedInfoString } from "@anytime-markdown/markdown-viewer";

const parse = parseEmbedInfoString as jest.Mock;

describe("mountEmbedPreview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("render で React root へ描画し、destroy で unmount する", () => {
    parse.mockReturnValue({ variant: "card", width: null });
    const container = document.createElement("div");
    const onWrite = jest.fn();
    const handle = mountEmbedPreview(container);
    handle.render("embed card", "https://x", "200px", onWrite);
    expect(mockRender).toHaveBeenCalledTimes(1);
    const el = mockRender.mock.calls[0][0];
    expect(el.props.language).toBe("embed card");
    expect(el.props.body).toBe("https://x");
    expect(el.props.widthOverride).toBe("200px");
    expect(el.props.onBaselineWrite).toBe(onWrite);
    handle.destroy();
    expect(mockUnmount).toHaveBeenCalled();
  });
});

describe("embed info helpers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("isEmbedResizable は card のみ true（未解析は既定 card）", () => {
    parse.mockReturnValueOnce({ variant: "card" });
    expect(isEmbedResizable("embed card")).toBe(true);
    parse.mockReturnValueOnce({ variant: "inline" });
    expect(isEmbedResizable("embed inline")).toBe(false);
    parse.mockReturnValueOnce(null);
    expect(isEmbedResizable("garbage")).toBe(true);
  });

  it("getEmbedStoredWidth は info string の width を返す", () => {
    parse.mockReturnValueOnce({ variant: "card", width: "300px" });
    expect(getEmbedStoredWidth("embed card 300px")).toBe("300px");
    parse.mockReturnValueOnce(null);
    expect(getEmbedStoredWidth("x")).toBeNull();
  });

  it("buildEmbedWidthLanguage は variant を保持して width を書き戻す", () => {
    parse.mockReturnValue({ variant: "card", width: null, rssFeedUrl: null });
    expect(buildEmbedWidthLanguage("embed card", "150px")).toBe("embed card 150px");
  });

  it("buildEmbedBaselineLanguage は variant/width を保持する", () => {
    parse.mockReturnValue({ variant: "card", width: "120px", rssFeedUrl: null });
    expect(buildEmbedBaselineLanguage("embed card 120px", { rssFeedUrl: null, baselineRssGuid: null, baselineOgpHash: null, rssChecked: false } as never)).toBe("embed card 120px");
  });
});
