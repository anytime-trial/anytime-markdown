/**
 * graphPreviewMount.ts — math グラフの React マウント（反転の限定許容）テスト。
 * react-dom/client と GraphView をモックする。
 */

const mockRender = jest.fn();
const mockUnmount = jest.fn();
jest.mock("react-dom/client", () => ({
  createRoot: jest.fn(() => ({ render: mockRender, unmount: mockUnmount })),
}));
jest.mock("../components/codeblock/GraphView", () => ({
  GraphView: function GraphView() { return null; },
}));

import { mountGraphPreview } from "../components/codeblock/graphPreviewMount";

describe("mountGraphPreview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("render で GraphView を描画し destroy で unmount する", () => {
    const handle = mountGraphPreview(document.createElement("div"));
    handle.render("y=x^2", true, false);
    expect(mockRender).toHaveBeenCalledTimes(1);
    const el = mockRender.mock.calls[0][0];
    expect(el.props.code).toBe("y=x^2");
    expect(el.props.enabled).toBe(true);
    expect(el.props.isDark).toBe(false);
    handle.destroy();
    expect(mockUnmount).toHaveBeenCalled();
  });
});
