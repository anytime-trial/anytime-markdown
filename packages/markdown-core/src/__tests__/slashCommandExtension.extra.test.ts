/**
 * slashCommandExtension.ts の追加カバレッジテスト
 * addProseMirrorPlugins のプラグイン生成をテスト。
 */
import { SlashCommandExtension, type SlashCommandState } from "../extensions/slashCommandExtension";

describe("SlashCommandExtension - addProseMirrorPlugins", () => {
  it("returns an array with one plugin", () => {
    const addPlugins = SlashCommandExtension.config.addProseMirrorPlugins as Function;
    const storage = {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
    const options = {
      onStateChange: jest.fn(),
    };
    const plugins = addPlugins.call({ storage, options, editor: {} });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(1);
  });

  it("plugin has handleDOMEvents", () => {
    const addPlugins = SlashCommandExtension.config.addProseMirrorPlugins as Function;
    const storage = {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
    const options = {
      onStateChange: jest.fn(),
    };
    const plugins = addPlugins.call({ storage, options, editor: {} });
    expect(plugins[0].props.handleDOMEvents).toBeDefined();
  });

  it("plugin has handleKeyDown", () => {
    const addPlugins = SlashCommandExtension.config.addProseMirrorPlugins as Function;
    const storage = {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
    const options = {
      onStateChange: jest.fn(),
    };
    const plugins = addPlugins.call({ storage, options, editor: {} });
    expect(plugins[0].props.handleKeyDown).toBeDefined();
  });
});

describe("SlashCommandExtension - configure", () => {
  it("configure returns extension with custom onStateChange", () => {
    const cb = jest.fn();
    const ext = SlashCommandExtension.configure({ onStateChange: cb });
    expect(ext).toBeDefined();
    expect(ext.options.onStateChange).toBe(cb);
  });
});

describe("SlashCommandExtension - handleKeyDown", () => {
  function getPlugin() {
    const addPlugins = SlashCommandExtension.config.addProseMirrorPlugins as Function;
    const storage = {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
    const options = {
      onStateChange: jest.fn(),
    };
    const plugins = addPlugins.call({ storage, options, editor: {} });
    return { plugin: plugins[0], storage, options };
  }

  it("returns false when not active", () => {
    const { plugin, storage } = getPlugin();
    storage.active = false;
    const handler = plugin.props.handleKeyDown;
    const result = handler({} as any, { key: "ArrowDown" } as any);
    expect(result).toBe(false);
  });

  it("Escape deactivates and returns true", () => {
    const { plugin, storage, options } = getPlugin();
    storage.active = true;
    const handler = plugin.props.handleKeyDown;
    const event = { key: "Escape", preventDefault: jest.fn() };
    const result = handler({} as any, event as any);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(storage.active).toBe(false);
    expect(options.onStateChange).toHaveBeenCalled();
  });

  it("ArrowDown forwards navigation key", () => {
    const { plugin, storage, options } = getPlugin();
    storage.active = true;
    const handler = plugin.props.handleKeyDown;
    const event = { key: "ArrowDown", preventDefault: jest.fn() };
    const result = handler({} as any, event as any);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(options.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ navigationKey: "ArrowDown" }),
    );
  });

  it("ArrowUp forwards navigation key", () => {
    const { plugin, storage, options } = getPlugin();
    storage.active = true;
    const handler = plugin.props.handleKeyDown;
    const event = { key: "ArrowUp", preventDefault: jest.fn() };
    const result = handler({} as any, event as any);
    expect(result).toBe(true);
  });

  it("Enter forwards navigation key", () => {
    const { plugin, storage, options } = getPlugin();
    storage.active = true;
    const handler = plugin.props.handleKeyDown;
    const event = { key: "Enter", preventDefault: jest.fn() };
    const result = handler({} as any, event as any);
    expect(result).toBe(true);
  });

  it("other keys return false when active", () => {
    const { plugin, storage } = getPlugin();
    storage.active = true;
    const handler = plugin.props.handleKeyDown;
    const event = { key: "a", preventDefault: jest.fn() };
    const result = handler({} as any, event as any);
    expect(result).toBe(false);
  });
});

describe("SlashCommandExtension - handleDOMEvents", () => {
  function getPlugin() {
    const addPlugins = SlashCommandExtension.config.addProseMirrorPlugins as Function;
    const storage = {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
    const options = {
      onStateChange: jest.fn(),
    };
    const plugins = addPlugins.call({ storage, options, editor: {} });
    return { plugin: plugins[0], storage };
  }

  it("compositionstart sets composing=true", () => {
    const { plugin, storage } = getPlugin();
    const handler = plugin.props.handleDOMEvents.compositionstart;
    handler({} as any, {} as any);
    expect(storage.composing).toBe(true);
  });

  it("compositionend sets composing=false", () => {
    const { plugin, storage } = getPlugin();
    storage.composing = true;
    const handler = plugin.props.handleDOMEvents.compositionend;
    handler({} as any, {} as any);
    expect(storage.composing).toBe(false);
  });
});
