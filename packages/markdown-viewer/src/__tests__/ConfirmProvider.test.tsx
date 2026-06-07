/**
 * ConfirmProvider と ConfirmDialog のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConfirmProvider, ConfirmContext } from "../providers/ConfirmProvider";


describe("ConfirmProvider", () => {
  it("renders children without crashing", () => {
    const { container } = render(
        <>
        <ConfirmProvider>
          <div data-testid="child">Hello</div>
        </ConfirmProvider>
        </>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("provides confirm function via context", () => {
    let confirmFn: any;
    render(
        <>
        <ConfirmProvider>
          <ConfirmContext.Consumer>
            {(value) => {
              confirmFn = value.confirm;
              return <div />;
            }}
          </ConfirmContext.Consumer>
        </ConfirmProvider>
        </>,
    );
    expect(typeof confirmFn).toBe("function");
  });
});

// --- useConfirm hook ---

describe("useConfirm", () => {
  it("returns a function", async () => {
    const { default: useConfirm } = await import("../hooks/useConfirm");
    const { renderHook } = await import("@testing-library/react");
    const wrapper = ({ children }: any) => (
        <ConfirmProvider>{children}</ConfirmProvider>
    );
    const { result } = renderHook(() => useConfirm(), { wrapper });
    expect(typeof result.current).toBe("function");
  });
});
