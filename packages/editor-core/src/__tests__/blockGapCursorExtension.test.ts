/**
 * blockGapCursorExtension.ts のテスト
 * BlockGapCursorExtension の構造と定数をテスト
 */
import { BlockGapCursorExtension } from "../extensions/blockGapCursorExtension";

describe("BlockGapCursorExtension", () => {
  it("has name 'blockGapCursor'", () => {
    expect(BlockGapCursorExtension.name).toBe("blockGapCursor");
  });

  it("defines addProseMirrorPlugins", () => {
    expect(BlockGapCursorExtension.config.addProseMirrorPlugins).toBeDefined();
  });

  it("addProseMirrorPlugins returns an array with one plugin", () => {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(1);
  });

  it("plugin has handleDOMEvents with keydown handler", () => {
    const addPlugins = BlockGapCursorExtension.config.addProseMirrorPlugins as () => any[];
    const plugins = addPlugins.call({});
    const plugin = plugins[0];
    expect(plugin.props).toBeDefined();
    expect(plugin.props.handleDOMEvents).toBeDefined();
    expect(plugin.props.handleDOMEvents.keydown).toBeDefined();
  });
});
