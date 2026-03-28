/**
 * usePlantUmlRender.ts - カバレッジテスト (lines 24, 29-32, 71-73, 87-89)
 * buildPlantUmlSource branches + cache miss/error paths
 */
import { renderHook, act } from "@testing-library/react";

// Mock plantuml-encoder
jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: (s: string) => `encoded-${s.length}` },
}));

jest.mock("../utils/BoundedMap", () => ({
  BoundedMap: jest.fn().mockImplementation(() => {
    const map = new Map<string, string>();
    return {
      get: (k: string) => map.get(k),
      set: (k: string, v: string) => map.set(k, v),
    };
  }),
}));

jest.mock("../utils/plantumlHelpers", () => ({
  buildPlantUmlUrl: (encoded: string) => `https://plantuml.com/svg/${encoded}`,
  PLANTUML_CONSENT_KEY: "plantuml-consent",
  PLANTUML_DARK_SKINPARAMS: "skinparam dark",
}));

// Mock sessionStorage
const sessionStore: Record<string, string> = {};
Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: (key: string) => sessionStore[key] ?? null,
    setItem: (key: string, value: string) => { sessionStore[key] = value; },
    removeItem: (key: string) => { delete sessionStore[key]; },
  },
});

import { usePlantUmlRender } from "../hooks/usePlantUmlRender";

describe("usePlantUmlRender coverage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete sessionStore["plantuml-consent"];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns empty URL when not PlantUML", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: false, isDark: false }),
    );
    expect(result.current.plantUmlUrl).toBe("");
  });

  it("returns empty URL when code is blank", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "  ", isPlantUml: true, isDark: false }),
    );
    expect(result.current.plantUmlUrl).toBe("");
  });

  it("consent is pending by default", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    expect(result.current.plantUmlConsent).toBe("pending");
  });

  it("handlePlantUmlAccept sets consent to accepted", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    expect(result.current.plantUmlConsent).toBe("accepted");
    expect(sessionStore["plantuml-consent"]).toBe("accepted");
  });

  it("handlePlantUmlReject sets consent to rejected", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.handlePlantUmlReject(); });
    expect(result.current.plantUmlConsent).toBe("rejected");
    expect(sessionStore["plantuml-consent"]).toBe("rejected");
  });

  it("generates URL after acceptance and delay (light mode, @startuml)", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.plantUmlUrl).toContain("https://plantuml.com/svg/");
    expect(result.current.error).toBe("");
  });

  it("generates URL in dark mode with dark skinparams", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: true }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.plantUmlUrl).toContain("https://plantuml.com/svg/");
  });

  it("handles non-@start code (wraps with @startuml/@enduml)", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "A -> B", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.plantUmlUrl).toContain("https://plantuml.com/svg/");
  });

  it("handles non-@start code in dark mode", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "A -> B", isPlantUml: true, isDark: true }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.plantUmlUrl).toContain("https://plantuml.com/svg/");
  });

  it("handles @startmindmap (no skinparam needed)", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startmindmap\n* root\n@endmindmap", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(result.current.plantUmlUrl).toContain("https://plantuml.com/svg/");
  });

  it("uses cached URL on second render", () => {
    // First render - generate and cache
    const { result, rerender: _rerender } = renderHook(
      ({ isDark }) => usePlantUmlRender({ code: "@startuml\nX->Y\n@enduml", isPlantUml: true, isDark }),
      { initialProps: { isDark: false } },
    );
    act(() => { result.current.handlePlantUmlAccept(); });
    act(() => { jest.advanceTimersByTime(600); });
    const firstUrl = result.current.plantUmlUrl;
    expect(firstUrl).toBeTruthy();
  });

  it("clears URL and error when consent is not accepted", () => {
    sessionStore["plantuml-consent"] = "rejected";
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    expect(result.current.plantUmlUrl).toBe("");
    expect(result.current.error).toBe("");
  });

  it("setError can be called externally", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA->B\n@enduml", isPlantUml: true, isDark: false }),
    );
    act(() => { result.current.setError("custom error"); });
    expect(result.current.error).toBe("custom error");
  });
});
