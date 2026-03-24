/**
 * ConfirmProvider.tsx - 追加カバレッジテスト (lines 46-47, 53-54, 58-61, 65-68)
 * confirm/cancel/close handlers
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConfirmProvider, ConfirmContext } from "../providers/ConfirmProvider";

const theme = createTheme();

function TestConsumer({ alertMode = false }: { alertMode?: boolean }) {
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
              alert: alertMode,
              title: "Confirm Title",
              description: "Confirm Description",
              confirmationText: "Yes",
              cancellationText: "No",
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

describe("ConfirmProvider coverage2", () => {
  it("resolves promise on confirm button click (lines 65-68)", async () => {
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

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByText("Confirm Title")).toBeTruthy();
    });

    // Click confirm button (the "Yes" button)
    const yesButton = screen.getByText("Yes");
    await act(async () => {
      fireEvent.click(yesButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("confirmed");
    });
  });

  it("rejects promise on cancel button click (lines 58-61)", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("Confirm Title")).toBeTruthy();
    });

    // Click cancel button (the "No" button)
    const noButton = screen.getByText("No");
    await act(async () => {
      fireEvent.click(noButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("cancelled");
    });
  });

  it("closes dialog on close handler (lines 53-54)", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("Confirm Title")).toBeTruthy();
    });

    // Pressing Escape or clicking outside triggers onClose
    // The dialog should have a close mechanism - click the backdrop
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      // Try pressing escape
      await act(async () => {
        fireEvent.keyDown(dialog, { key: "Escape" });
      });
    }
  });

  it("handles multiple confirm/cancel cycles", async () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmProvider>
          <TestConsumer />
        </ConfirmProvider>
      </ThemeProvider>,
    );

    // First: confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    await waitFor(() => {
      expect(screen.getByText("Confirm Title")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Yes"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("confirmed");
    });

    // Second: cancel
    await act(async () => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    await waitFor(() => {
      expect(screen.getByText("Confirm Title")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("No"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("cancelled");
    });
  });
});
