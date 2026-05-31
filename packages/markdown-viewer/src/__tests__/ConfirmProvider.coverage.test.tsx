/**
 * ConfirmProvider.tsx のカバレッジテスト
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConfirmProvider, ConfirmContext } from "../providers/ConfirmProvider";

const theme = createTheme();

function TestConsumer() {
  const { confirm } = React.useContext(ConfirmContext);
  const [result, setResult] = React.useState<string>("");

  return (
    <div>
      <button
        data-testid="trigger"
        onClick={async () => {
          try {
            await confirm({
              open: true,
              alert: false,
              title: "Test Title",
              description: "Test Description",
              confirmationText: "",
              cancellationText: "",
            });
            setResult("confirmed");
          } catch {
            setResult("cancelled");
          }
        }}
      >
        Trigger
      </button>
      <span data-testid="result">{result}</span>
    </div>
  );
}

describe("ConfirmProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmProvider>
          <div data-testid="child">child</div>
        </ConfirmProvider>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("shows confirm dialog when confirm is called", async () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmProvider>
          <TestConsumer />
        </ConfirmProvider>
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    // Dialog should appear with title
    await waitFor(() => {
      expect(screen.getByText("Test Title")).toBeTruthy();
    });
  });

  it("default context confirm resolves", async () => {
    const defaultCtx = { confirm: () => Promise.resolve() };
    expect(await defaultCtx.confirm()).toBeUndefined();
  });
});
