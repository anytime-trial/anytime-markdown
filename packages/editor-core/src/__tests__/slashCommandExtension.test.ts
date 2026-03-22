/**
 * slashCommandExtension.ts のテスト
 * SlashCommandExtension の構造と SlashCommandState 型をテスト
 */
import { SlashCommandExtension, type SlashCommandState } from "../extensions/slashCommandExtension";

describe("SlashCommandExtension", () => {
  it("has name 'slashCommand'", () => {
    expect(SlashCommandExtension.name).toBe("slashCommand");
  });

  it("defines addOptions with default onStateChange", () => {
    const config = SlashCommandExtension.config;
    expect(config.addOptions).toBeDefined();
  });

  it("addOptions returns an object with onStateChange function", () => {
    const addOptions = SlashCommandExtension.config.addOptions as () => { onStateChange: (s: SlashCommandState) => void };
    const options = addOptions();
    expect(options.onStateChange).toBeInstanceOf(Function);
    // Default onStateChange should be a no-op
    expect(() => options.onStateChange({ active: false, query: "", from: 0, navigationKey: null })).not.toThrow();
  });

  it("defines addStorage", () => {
    expect(SlashCommandExtension.config.addStorage).toBeDefined();
  });

  it("addStorage returns correct default values", () => {
    const addStorage = SlashCommandExtension.config.addStorage as () => Record<string, unknown>;
    const storage = addStorage();
    expect(storage.active).toBe(false);
    expect(storage.query).toBe("");
    expect(storage.from).toBe(0);
    expect(storage.composing).toBe(false);
  });

  it("defines addProseMirrorPlugins", () => {
    expect(SlashCommandExtension.config.addProseMirrorPlugins).toBeDefined();
  });
});

describe("SlashCommandState type", () => {
  it("can construct a valid state", () => {
    const state: SlashCommandState = {
      active: true,
      query: "head",
      from: 5,
      navigationKey: "ArrowDown",
    };
    expect(state.active).toBe(true);
    expect(state.query).toBe("head");
    expect(state.from).toBe(5);
    expect(state.navigationKey).toBe("ArrowDown");
  });

  it("accepts null navigationKey", () => {
    const state: SlashCommandState = {
      active: false,
      query: "",
      from: 0,
      navigationKey: null,
    };
    expect(state.navigationKey).toBeNull();
  });

  it("accepts all valid navigationKey values", () => {
    const keys: SlashCommandState["navigationKey"][] = ["ArrowUp", "ArrowDown", "Enter", "Escape", null];
    for (const key of keys) {
      const state: SlashCommandState = { active: true, query: "", from: 0, navigationKey: key };
      expect(state.navigationKey).toBe(key);
    }
  });
});
