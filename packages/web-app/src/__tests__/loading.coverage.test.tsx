import { render } from "@testing-library/react";
import React from "react";

jest.mock("@anytime-markdown/markdown-core/src/components/loader/FullPageLoader", () => ({
  __esModule: true,
  default: () => <div data-testid="loader">Loading...</div>,
}));

import Loading from "../app/loading";

describe("Loading", () => {
  it("renders FullPageLoader", () => {
    const { getByTestId } = render(<Loading />);
    expect(getByTestId("loader")).toBeTruthy();
  });
});
