/**
 * ConfirmProvider と ConfirmDialog のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConfirmProvider, ConfirmContext } from "../providers/ConfirmProvider";

const theme = createTheme();

describe("ConfirmProvider", () => {
  it("renders children without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ConfirmProvider>
          <div data-testid="child">Hello</div>
        </ConfirmProvider>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("provides confirm function via context", () => {
    let confirmFn: any;
    render(
      <ThemeProvider theme={theme}>
        <ConfirmProvider>
          <ConfirmContext.Consumer>
            {(value) => {
              confirmFn = value.confirm;
              return <div />;
            }}
          </ConfirmContext.Consumer>
        </ConfirmProvider>
      </ThemeProvider>,
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
      <ThemeProvider theme={createTheme()}>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ThemeProvider>
    );
    const { result } = renderHook(() => useConfirm(), { wrapper });
    expect(typeof result.current).toBe("function");
  });
});
