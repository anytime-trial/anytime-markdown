import { renderHook, act } from "@testing-library/react";

jest.mock("@anytime-markdown/graph-core/state", () => ({
  graphReducer: (state: any, action: any) => {
    if (action.type === "SET_TOOL") return { ...state, tool: action.tool };
    return state;
  },
  createInitialState: (doc?: any) => ({
    document: doc ?? {
      id: "test",
      name: "Untitled",
      nodes: [],
      edges: [],
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    selection: { nodeIds: [], edgeIds: [] },
    history: [],
    historyIndex: -1,
  }),
}));

import { useGraphState } from "@anytime-markdown/graph-viewer/src/hooks/useGraphState";

describe("useGraphState", () => {
  it("returns initial state and dispatch", () => {
    const { result } = renderHook(() => useGraphState());
    expect(result.current.state).toBeDefined();
    expect(result.current.state.document).toBeDefined();
    expect(result.current.dispatch).toBeDefined();
  });

  it("accepts initial document", () => {
    const doc = {
      id: "custom",
      name: "Custom",
      nodes: [],
      edges: [],
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const { result } = renderHook(() => useGraphState(doc as any));
    expect(result.current.state.document.id).toBe("custom");
  });

  it("dispatches action", () => {
    const { result } = renderHook(() => useGraphState());
    act(() => {
      result.current.dispatch({ type: "DELETE_SELECTED" });
    });
  });
});
