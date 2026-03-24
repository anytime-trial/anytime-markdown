/**
 * usePlantUmlRender のユニットテスト
 *
 * PlantUML レンダリング hook の状態管理を検証する。
 */

import { renderHook, act } from "@testing-library/react";

jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: jest.fn().mockReturnValue("encoded") },
}));

jest.mock("../utils/plantumlHelpers", () => ({
  buildPlantUmlUrl: jest.fn().mockImplementation((encoded: string) => `https://www.plantuml.com/plantuml/svg/${encoded}`),
  PLANTUML_CONSENT_KEY: "plantuml-external-consent",
  PLANTUML_DARK_SKINPARAMS: "skinparam backgroundColor #1E1E1E",
}));

jest.mock("../utils/BoundedMap", () => ({
  BoundedMap: jest.fn().mockImplementation(() => {
    const map = new Map();
    return {
      get: (key: string) => map.get(key),
      set: (key: string, val: string) => map.set(key, val),
    };
  }),
}));

import { usePlantUmlRender } from "../hooks/usePlantUmlRender";

describe("usePlantUmlRender", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("isPlantUml=false のとき URL は空", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: false, isDark: false }),
    );

    expect(result.current.plantUmlUrl).toBe("");
    expect(result.current.error).toBe("");
  });

  it("空の code のとき URL は空", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "  ", isPlantUml: true, isDark: false }),
    );

    expect(result.current.plantUmlUrl).toBe("");
  });

  it("consent が pending のとき URL は生成されない", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(result.current.plantUmlUrl).toBe("");
    expect(result.current.plantUmlConsent).toBe("pending");
  });

  it("handlePlantUmlAccept で consent が accepted になる", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    act(() => {
      result.current.handlePlantUmlAccept();
    });

    expect(result.current.plantUmlConsent).toBe("accepted");
    expect(sessionStorage.getItem("plantuml-external-consent")).toBe("accepted");
  });

  it("handlePlantUmlReject で consent が rejected になる", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    act(() => {
      result.current.handlePlantUmlReject();
    });

    expect(result.current.plantUmlConsent).toBe("rejected");
    expect(sessionStorage.getItem("plantuml-external-consent")).toBe("rejected");
  });

  it("consent accepted 後に URL が生成される", async () => {
    sessionStorage.setItem("plantuml-external-consent", "accepted");

    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(result.current.plantUmlUrl).toContain("plantuml.com/plantuml/svg/");
    expect(result.current.error).toBe("");
  });

  it("setError で手動エラーを設定できる", () => {
    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    act(() => {
      result.current.setError("Manual error");
    });

    expect(result.current.error).toBe("Manual error");
  });

  it("sessionStorage に rejected が保存されていれば初期状態が rejected", () => {
    sessionStorage.setItem("plantuml-external-consent", "rejected");

    const { result } = renderHook(() =>
      usePlantUmlRender({ code: "@startuml\nA -> B\n@enduml", isPlantUml: true, isDark: false }),
    );

    expect(result.current.plantUmlConsent).toBe("rejected");
  });
});
