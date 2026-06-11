/**
 * FullPageLoader（React island）のスモークテスト。
 */
import { render } from "@testing-library/react";

describe("FullPageLoader", () => {
  it("renders without crashing", async () => {
    const mod = await import("../components/loader/FullPageLoader");
    const FullPageLoader = mod.default;
    const { container } = render(<FullPageLoader />);
    expect(container).toBeTruthy();
  });
});
