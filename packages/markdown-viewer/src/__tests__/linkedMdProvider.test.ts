import {
  getLinkedMdProvider,
  setLinkedMdProvider,
  type LinkedMdProvider,
} from "../linkedMdProvider";

function makeProvider(): LinkedMdProvider {
  return {
    fetch: jest.fn(async () => ({
      content: "# Linked",
      resolvedPath: "/workspace/linked.md",
      token: { mtimeMs: 1, size: 8 },
    })),
    save: jest.fn(async () => ({
      token: { mtimeMs: 2, size: 9 },
      conflict: false,
    })),
  };
}

describe("linkedMdProvider", () => {
  beforeEach(() => {
    setLinkedMdProvider(null);
  });

  afterEach(() => {
    setLinkedMdProvider(null);
  });

  test("未設定時 getLinkedMdProvider は null を返す", () => {
    expect(getLinkedMdProvider()).toBeNull();
  });

  test("setLinkedMdProvider で注入した provider と同一参照を返す", () => {
    const provider = makeProvider();

    setLinkedMdProvider(provider);

    expect(getLinkedMdProvider()).toBe(provider);
  });

  test("setLinkedMdProvider(null) で null にリセットする", () => {
    setLinkedMdProvider(makeProvider());

    setLinkedMdProvider(null);

    expect(getLinkedMdProvider()).toBeNull();
  });
});
