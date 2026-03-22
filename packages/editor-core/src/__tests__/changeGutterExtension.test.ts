/**
 * changeGutterExtension.ts のテスト
 * getChangedPositions, ChangeGutterExtension の構造をテスト
 */
import { ChangeGutterExtension, getChangedPositions } from "../extensions/changeGutterExtension";

describe("ChangeGutterExtension", () => {
  it("has name 'changeGutter'", () => {
    expect(ChangeGutterExtension.name).toBe("changeGutter");
  });

  it("defines addCommands", () => {
    expect(ChangeGutterExtension.config.addCommands).toBeDefined();
  });

  it("defines addProseMirrorPlugins", () => {
    expect(ChangeGutterExtension.config.addProseMirrorPlugins).toBeDefined();
  });

  it("addCommands returns expected command names", () => {
    const addCommands = ChangeGutterExtension.config.addCommands as () => Record<string, unknown>;
    const commands = addCommands.call({ storage: {}, editor: {} });
    expect(commands).toHaveProperty("setChangeGutterBaseline");
    expect(commands).toHaveProperty("clearChangeGutter");
    expect(commands).toHaveProperty("goToNextChange");
    expect(commands).toHaveProperty("goToPrevChange");
  });
});

describe("getChangedPositions", () => {
  it("returns empty array when plugin state is undefined", () => {
    // Mock editorState with no plugin state
    const mockState = {
      plugins: [],
    } as unknown as import("@tiptap/pm/state").EditorState;

    const positions = getChangedPositions(mockState);
    expect(positions).toEqual([]);
  });
});
