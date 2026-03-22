/**
 * headingFoldExtension.ts のテスト
 */
import { HeadingFoldExtension, headingFoldPluginKey } from "../extensions/headingFoldExtension";

describe("headingFoldPluginKey", () => {
  it("is defined", () => {
    expect(headingFoldPluginKey).toBeDefined();
  });
});

describe("HeadingFoldExtension", () => {
  it("has name 'headingFold'", () => {
    expect(HeadingFoldExtension.name).toBe("headingFold");
  });

  it("defines addProseMirrorPlugins", () => {
    expect(HeadingFoldExtension.config.addProseMirrorPlugins).toBeDefined();
  });

  it("defines addCommands", () => {
    expect(HeadingFoldExtension.config.addCommands).toBeDefined();
  });

  it("addCommands returns expected command names", () => {
    const addCommands = HeadingFoldExtension.config.addCommands as () => Record<string, unknown>;
    const commands = addCommands.call({ storage: {}, editor: {} });
    expect(commands).toHaveProperty("setFoldedHeadings");
  });
});
