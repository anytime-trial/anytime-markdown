/**
 * ScreenCaptureDialog.tsx coverage2 tests
 * Targets uncovered lines: 63-64, 82-93, 99-100, 107-109
 * - track ended callback (63-64)
 * - handleCapture: canvas drawing (82-93)
 * - handleCropComplete (99-100)
 * - handleRetry (107-109)
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextDisabled: () => "#999",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  CHIP_FONT_SIZE: 12,
  PANEL_BUTTON_FONT_SIZE: 12,
  STATUSBAR_FONT_SIZE: 11,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="dialog-wrapper">{children}</div> : null,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ label, onClose }: any) => (
    <div data-testid="dialog-header">
      <span>{label}</span>
      <button onClick={onClose} data-testid="header-close">close</button>
    </div>
  ),
}));

jest.mock("../components/ImageCropTool", () => ({
  ImageCropTool: ({ src, onCrop }: any) => (
    <div data-testid="image-crop-tool">
      <span>{src}</span>
      <button onClick={() => onCrop("cropped-data-url")} data-testid="crop-apply">Apply</button>
    </div>
  ),
}));

import { ScreenCaptureDialog } from "../components/ScreenCaptureDialog";

const theme = createTheme();
const mockGetDisplayMedia = jest.fn();
let trackEndedCallback: (() => void) | null = null;
const mockTrackStop = jest.fn();

function createMockStream() {
  trackEndedCallback = null;
  const track = {
    stop: mockTrackStop,
    addEventListener: jest.fn((_event: string, cb: () => void) => {
      trackEndedCallback = cb;
    }),
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: { getDisplayMedia: mockGetDisplayMedia },
});

function renderDialog(props: Partial<React.ComponentProps<typeof ScreenCaptureDialog>> = {}) {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onCapture: jest.fn(),
    t: (key: string) => key,
    ...props,
  };
  return render(
    <ThemeProvider theme={theme}>
      <ScreenCaptureDialog {...defaultProps} />
    </ThemeProvider>,
  );
}

describe("ScreenCaptureDialog - coverage2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trackEndedCallback = null;
  });

  // --- Previewing phase with capture and retry buttons (lines 82-93, 107-109) ---
  test("previewing phase shows capture and retry buttons, capture creates screenshot", async () => {
    const mockStream = createMockStream();
    mockGetDisplayMedia.mockResolvedValue(mockStream);

    // Mock HTMLVideoElement.play and canvas
    const mockPlay = jest.fn().mockResolvedValue(undefined);
    const origCreateElement = document.createElement.bind(document);
    const mockDrawImage = jest.fn();
    const mockToDataURL = jest.fn().mockReturnValue("data:image/png;base64,captured");

    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: mockDrawImage }),
          toDataURL: mockToDataURL,
        } as any;
      }
      return origCreateElement(tag);
    });

    // Mock videoRef
    jest.spyOn(HTMLVideoElement.prototype, "play").mockImplementation(mockPlay);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { value: 1920, configurable: true });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { value: 1080, configurable: true });

    const onCapture = jest.fn();
    await act(async () => {
      renderDialog({ onCapture });
    });

    // Should be in previewing phase
    await waitFor(() => {
      expect(screen.getByText("screenCaptureShoot")).toBeTruthy();
    });

    // Also retry button should be visible
    expect(screen.getByText("screenCaptureRetry")).toBeTruthy();

    // Click capture
    await act(async () => {
      fireEvent.click(screen.getByText("screenCaptureShoot"));
    });

    // Should now be in captured phase with crop tool
    await waitFor(() => {
      expect(screen.getByTestId("image-crop-tool")).toBeTruthy();
    });

    // Click apply crop
    await act(async () => {
      fireEvent.click(screen.getByTestId("crop-apply"));
    });

    // onCapture should have been called
    expect(onCapture).toHaveBeenCalledWith("cropped-data-url");

    jest.restoreAllMocks();
  });

  // --- Track ended callback (lines 63-64) ---
  test("track ended callback resets to idle phase", async () => {
    const mockStream = createMockStream();
    mockGetDisplayMedia.mockResolvedValue(mockStream);

    jest.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);

    await act(async () => {
      renderDialog();
    });

    // Should be previewing
    await waitFor(() => {
      expect(screen.getByText("screenCaptureShoot")).toBeTruthy();
    });

    // Trigger track ended
    act(() => {
      trackEndedCallback?.();
    });

    // Should go back to idle - capture button should disappear
    await waitFor(() => {
      expect(screen.queryByText("screenCaptureShoot")).toBeNull();
    });

    jest.restoreAllMocks();
  });

  // --- handleRetry (lines 107-109) ---
  test("retry button resets to idle and calls getDisplayMedia again", async () => {
    const mockStream = createMockStream();
    mockGetDisplayMedia.mockResolvedValue(mockStream);

    jest.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);

    await act(async () => {
      renderDialog();
    });

    await waitFor(() => {
      expect(screen.getByText("screenCaptureRetry")).toBeTruthy();
    });

    // Click retry
    const callCount = mockGetDisplayMedia.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByText("screenCaptureRetry"));
    });

    // Should call getDisplayMedia again (auto-call on idle phase)
    await waitFor(() => {
      expect(mockGetDisplayMedia.mock.calls.length).toBeGreaterThan(callCount);
    });

    jest.restoreAllMocks();
  });

  // --- Captured phase retry (line 171) ---
  test("captured phase shows retry button", async () => {
    const mockStream = createMockStream();
    mockGetDisplayMedia.mockResolvedValue(mockStream);

    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: jest.fn() }),
          toDataURL: () => "data:image/png;base64,test",
        } as any;
      }
      return origCreateElement(tag);
    });
    jest.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { value: 100, configurable: true });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { value: 100, configurable: true });

    await act(async () => {
      renderDialog();
    });

    await waitFor(() => {
      expect(screen.getByText("screenCaptureShoot")).toBeTruthy();
    });

    // Capture
    await act(async () => {
      fireEvent.click(screen.getByText("screenCaptureShoot"));
    });

    // Should show retry in captured phase
    await waitFor(() => {
      expect(screen.getByText("screenCaptureRetry")).toBeTruthy();
      expect(screen.getByTestId("image-crop-tool")).toBeTruthy();
    });

    jest.restoreAllMocks();
  });

  // --- Cleanup on close (lines 42-46) ---
  test("closing dialog stops stream and resets phase", async () => {
    const mockStream = createMockStream();
    mockGetDisplayMedia.mockResolvedValue(mockStream);
    jest.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);

    const { rerender } = await act(async () => {
      return renderDialog();
    });

    await waitFor(() => {
      expect(mockGetDisplayMedia).toHaveBeenCalled();
    });

    // Close dialog
    await act(async () => {
      rerender(
        <ThemeProvider theme={theme}>
          <ScreenCaptureDialog open={false} onClose={jest.fn()} onCapture={jest.fn()} t={(key: string) => key} />
        </ThemeProvider>,
      );
    });

    expect(mockTrackStop).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
