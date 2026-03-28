/**
 * editorExtensions.ts coverage tests
 * Targets uncovered lines: 52-60 (TaskListTight), 75-105 (ListTextCleanup),
 * 130-280 (keyboard shortcuts in disableFormattingShortcuts)
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("lowlight", () => ({
  createLowlight: () => ({
    register: jest.fn(),
  }),
  common: {},
}));

import { getBaseExtensions } from "../editorExtensions";

describe("editorExtensions coverage - TaskListTight extension", () => {
  it("TaskListTight has addGlobalAttributes that returns taskList config", () => {
    const extensions = getBaseExtensions();
    const taskListTight = extensions.find((e: any) => (e.name || e.config?.name) === "taskListTight");
    expect(taskListTight).toBeDefined();

    // Access the global attributes configuration
    const ext = taskListTight as any;
    ext.options ?? {};
    // The extension should define globalAttributes via addGlobalAttributes
    // We can check via the extension's config
    if (ext.config?.addGlobalAttributes) {
      const attrs = ext.config.addGlobalAttributes.call({});
      expect(attrs).toBeDefined();
      expect(Array.isArray(attrs)).toBe(true);
      expect(attrs.length).toBe(1);
      expect(attrs[0].types).toContain("taskList");
      expect(attrs[0].attributes.tight).toBeDefined();
      expect(attrs[0].attributes.tight.default).toBe(true);

      // Test parseHTML with data-tight="true"
      const el = document.createElement("ul");
      el.dataset.tight = "true";
      expect(attrs[0].attributes.tight.parseHTML(el)).toBe(true);

      // Test parseHTML with no data-tight and no <p> child (tight)
      const el2 = document.createElement("ul");
      expect(attrs[0].attributes.tight.parseHTML(el2)).toBe(true);

      // Test parseHTML with data-tight="false" and <p> child (not tight)
      const el3 = document.createElement("ul");
      el3.dataset.tight = "false";
      const p = document.createElement("p");
      el3.appendChild(document.createElement("li")).appendChild(p);
      // data-tight is "false" so first condition is false, check second: !querySelector("p")
      const result = attrs[0].attributes.tight.parseHTML(el3);
      // "false" !== "true" -> first is false; !el3.querySelector("p") -> false
      expect(result).toBe(false);

      // Test renderHTML with tight=true
      const html = attrs[0].attributes.tight.renderHTML({ tight: true });
      expect(html).toEqual({ class: "tight", "data-tight": "true" });

      // Test renderHTML with tight=false
      const html2 = attrs[0].attributes.tight.renderHTML({ tight: false });
      expect(html2).toEqual({});
    }
  });
});

describe("editorExtensions coverage - ListTextCleanup extension", () => {
  it("ListTextCleanup extension exists and has ProseMirror plugins", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    expect(listTextCleanup).toBeDefined();

    // Verify it has addProseMirrorPlugins
    const ext = listTextCleanup as any;
    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(1);
      const plugin = plugins[0];
      expect(plugin).toBeDefined();
      // Plugin should have spec with appendTransaction
      expect(plugin.spec.appendTransaction).toBeDefined();
    }
  });

  it("ListTextCleanup appendTransaction returns null when no doc changes", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      // Transaction with no docChanged
      const mockTransactions = [{ docChanged: false }];
      const result = appendTx(mockTransactions, {}, {});
      expect(result).toBeNull();
    }
  });

  it("ListTextCleanup appendTransaction processes text nodes ending with newline in list items", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      // Transaction with docChanged but no matching nodes
      const mockTransactions = [{ docChanged: true }];
      const mockDoc = {
        descendants: jest.fn((cb: any) => {
          // Call with a non-text node
          cb({ isText: false, text: null }, 0);
          // Call with text node not ending in \n
          cb({ isText: true, text: "hello" }, 5);
        }),
      };
      const mockState = {
        doc: mockDoc,
        tr: { replaceWith: jest.fn(), delete: jest.fn() },
      };
      const result = appendTx(mockTransactions, {}, mockState);
      expect(result).toBeNull();
    }
  });

  it("ListTextCleanup trims trailing newlines from text in listItem paragraphs", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      const mockTransactions = [{ docChanged: true }];

      const mockMark = { type: { name: "bold" } };
      const mockSchema = {
        text: jest.fn((text: string, marks: any) => ({ text, marks })),
      };
      const mockTr = {
        replaceWith: jest.fn(),
        delete: jest.fn(),
      };

      // Create a node structure: listItem > paragraph > textNode("hello\n")
      const nodeWithNewline = {
        isText: true,
        text: "hello\n",
        marks: [mockMark],
      };

      const paragraphParent = { type: { name: "paragraph" } };
      const listItemNode = { type: { name: "listItem" } };

      const mockDoc = {
        descendants: jest.fn((cb: any) => {
          cb(nodeWithNewline, 10);
        }),
        resolve: jest.fn((pos: number) => ({
          parent: paragraphParent,
          depth: 2,
          node: (d: number) => {
            if (d === 1) return listItemNode;
            if (d === 2) return paragraphParent;
            return { type: { name: "doc" } };
          },
        })),
      };

      const mockState = {
        doc: mockDoc,
        tr: mockTr,
        schema: mockSchema,
      };

      const result = appendTx(mockTransactions, {}, mockState);
      expect(result).toBe(mockTr);
      expect(mockTr.replaceWith).toHaveBeenCalled();
      expect(mockSchema.text).toHaveBeenCalledWith("hello", [mockMark]);
    }
  });

  it("ListTextCleanup deletes text node when only newlines remain", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      const mockTransactions = [{ docChanged: true }];

      const mockSchema = {
        text: jest.fn((text: string, marks: any) => ({ text, marks })),
      };
      const mockTr = {
        replaceWith: jest.fn(),
        delete: jest.fn(),
      };

      // Text node that is only newlines
      const nodeOnlyNewlines = {
        isText: true,
        text: "\n\n",
        marks: [],
      };

      const paragraphParent = { type: { name: "paragraph" } };
      const listItemNode = { type: { name: "listItem" } };

      const mockDoc = {
        descendants: jest.fn((cb: any) => {
          cb(nodeOnlyNewlines, 5);
        }),
        resolve: jest.fn((pos: number) => ({
          parent: paragraphParent,
          depth: 2,
          node: (d: number) => {
            if (d === 1) return listItemNode;
            return { type: { name: "doc" } };
          },
        })),
      };

      const mockState = {
        doc: mockDoc,
        tr: mockTr,
        schema: mockSchema,
      };

      const result = appendTx(mockTransactions, {}, mockState);
      expect(result).toBe(mockTr);
      expect(mockTr.delete).toHaveBeenCalledWith(5, 7); // pos to pos + text.length
    }
  });

  it("ListTextCleanup skips text nodes not inside paragraph", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      const mockTransactions = [{ docChanged: true }];

      const nodeWithNewline = { isText: true, text: "hello\n", marks: [] };
      const headingParent = { type: { name: "heading" } };

      const mockDoc = {
        descendants: jest.fn((cb: any) => {
          cb(nodeWithNewline, 10);
        }),
        resolve: jest.fn(() => ({
          parent: headingParent,
          depth: 1,
          node: () => ({ type: { name: "heading" } }),
        })),
      };

      const mockState = {
        doc: mockDoc,
        tr: { replaceWith: jest.fn(), delete: jest.fn() },
      };

      const result = appendTx(mockTransactions, {}, mockState);
      expect(result).toBeNull();
    }
  });

  it("ListTextCleanup skips text in paragraph not inside listItem", () => {
    const extensions = getBaseExtensions();
    const listTextCleanup = extensions.find((e: any) => (e.name || e.config?.name) === "listTextCleanup");
    const ext = listTextCleanup as any;

    if (ext.config?.addProseMirrorPlugins) {
      const plugins = ext.config.addProseMirrorPlugins.call({});
      const plugin = plugins[0];
      const appendTx = plugin.spec.appendTransaction;

      const mockTransactions = [{ docChanged: true }];

      const nodeWithNewline = { isText: true, text: "hello\n", marks: [] };
      const paragraphParent = { type: { name: "paragraph" } };

      const mockDoc = {
        descendants: jest.fn((cb: any) => {
          cb(nodeWithNewline, 10);
        }),
        resolve: jest.fn(() => ({
          parent: paragraphParent,
          depth: 1,
          node: (d: number) => {
            // No listItem in ancestors
            if (d === 1) return paragraphParent;
            return { type: { name: "doc" } };
          },
        })),
      };

      const mockState = {
        doc: mockDoc,
        tr: { replaceWith: jest.fn(), delete: jest.fn() },
      };

      const result = appendTx(mockTransactions, {}, mockState);
      expect(result).toBeNull();
    }
  });
});

describe("editorExtensions coverage - disableFormattingShortcuts", () => {
  it("disableFormattingShortcuts extension has keyboard shortcuts defined", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;
    expect(ext).toBeDefined();

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      expect(shortcuts).toBeDefined();

      // Test that formatting shortcuts return true (disabled)
      expect(shortcuts["Mod-b"]()).toBe(true);
      expect(shortcuts["Mod-i"]()).toBe(true);
      expect(shortcuts["Mod-u"]()).toBe(true);
      expect(shortcuts["Mod-e"]()).toBe(true);
      expect(shortcuts["Mod-Shift-x"]()).toBe(true);
      expect(shortcuts["Mod-Shift-h"]()).toBe(true);
      expect(shortcuts["Mod-Shift-7"]()).toBe(true);
      expect(shortcuts["Mod-Shift-8"]()).toBe(true);
      expect(shortcuts["Mod-Shift-9"]()).toBe(true);
      expect(shortcuts["Mod-k"]()).toBe(true);
    }
  });

  it("Tab in heading increases level", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      // Mock editor for Tab shortcut - heading at level 2
      const mockChain = { focus: jest.fn().mockReturnThis(), setHeading: jest.fn().mockReturnValue({ run: jest.fn().mockReturnValue(true) }) };
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "heading" }, attrs: { level: 2 } },
            },
          },
        },
        chain: jest.fn().mockReturnValue(mockChain),
      };
      const result = shortcuts["Tab"]({ editor: mockEditor });
      expect(result).toBe(true);
      expect(mockChain.setHeading).toHaveBeenCalledWith({ level: 3 });
    }
  });

  it("Tab in heading at max level (5) returns true without changing", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "heading" }, attrs: { level: 5 } },
            },
          },
        },
      };
      expect(shortcuts["Tab"]({ editor: mockEditor })).toBe(true);
    }
  });

  it("Tab in non-heading returns true (suppresses focus escape)", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "paragraph" }, attrs: {} },
            },
          },
        },
      };
      expect(shortcuts["Tab"]({ editor: mockEditor })).toBe(true);
    }
  });

  it("Shift-Tab in heading decreases level", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockChain = { focus: jest.fn().mockReturnThis(), setHeading: jest.fn().mockReturnValue({ run: jest.fn().mockReturnValue(true) }) };
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "heading" }, attrs: { level: 3 } },
            },
          },
        },
        chain: jest.fn().mockReturnValue(mockChain),
      };
      expect(shortcuts["Shift-Tab"]({ editor: mockEditor })).toBe(true);
      expect(mockChain.setHeading).toHaveBeenCalledWith({ level: 2 });
    }
  });

  it("Shift-Tab in heading at level 1 returns true without changing", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "heading" }, attrs: { level: 1 } },
            },
          },
        },
      };
      expect(shortcuts["Shift-Tab"]({ editor: mockEditor })).toBe(true);
    }
  });

  it("Shift-Tab in non-heading returns true (suppresses focus escape)", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { type: { name: "paragraph" }, attrs: {} },
            },
          },
        },
      };
      expect(shortcuts["Shift-Tab"]({ editor: mockEditor })).toBe(true);
    }
  });

  it("Mod-Enter inserts empty paragraph below", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockTr = {
        insert: jest.fn(),
        setSelection: jest.fn(),
        scrollIntoView: jest.fn().mockReturnThis(),
        doc: { resolve: jest.fn().mockReturnValue({}) },
      };
      const mockEditor = {
        state: {
          selection: { $from: { end: jest.fn().mockReturnValue(10) } },
          tr: mockTr,
          schema: { nodes: { paragraph: { create: jest.fn().mockReturnValue({ type: "paragraph" }) } } },
        },
        view: { dispatch: jest.fn() },
      };

      // Mock TextSelection.near
      const { TextSelection } = require("@tiptap/pm/state");
      const nearSpy = jest.spyOn(TextSelection, "near").mockReturnValue({});

      const result = shortcuts["Mod-Enter"]({ editor: mockEditor });
      expect(result).toBe(true);
      expect(mockTr.insert).toHaveBeenCalledWith(11, { type: "paragraph" });
      nearSpy.mockRestore();
    }
  });

  it("Mod-Shift-Enter inserts empty paragraph above", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockTr = {
        insert: jest.fn(),
        setSelection: jest.fn(),
        scrollIntoView: jest.fn().mockReturnThis(),
        doc: { resolve: jest.fn().mockReturnValue({}) },
      };
      const mockEditor = {
        state: {
          selection: { $from: { before: jest.fn().mockReturnValue(5) } },
          tr: mockTr,
          schema: { nodes: { paragraph: { create: jest.fn().mockReturnValue({ type: "paragraph" }) } } },
        },
        view: { dispatch: jest.fn() },
      };

      const { TextSelection } = require("@tiptap/pm/state");
      const nearSpy = jest.spyOn(TextSelection, "near").mockReturnValue({});

      const result = shortcuts["Mod-Shift-Enter"]({ editor: mockEditor });
      expect(result).toBe(true);
      expect(mockTr.insert).toHaveBeenCalledWith(5, { type: "paragraph" });
      nearSpy.mockRestore();
    }
  });

  it("Mod-l selects current block", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockTr = {
        setSelection: jest.fn(),
        doc: {},
      };
      const mockNode = { nodeSize: 10 };
      const mockEditor = {
        state: {
          selection: {
            $from: {
              before: jest.fn().mockReturnValue(5),
              node: jest.fn().mockReturnValue(mockNode),
            },
          },
          tr: mockTr,
        },
        view: { dispatch: jest.fn() },
      };

      const { TextSelection } = require("@tiptap/pm/state");
      const createSpy = jest.spyOn(TextSelection, "create").mockReturnValue({});

      const result = shortcuts["Mod-l"]({ editor: mockEditor });
      expect(result).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(mockTr.doc, 5, 15);
      createSpy.mockRestore();
    }
  });

  it("Mod-d selects word at cursor", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockTr = {
        setSelection: jest.fn(),
        doc: {},
      };
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { textContent: "hello world" },
              parentOffset: 2, // cursor within "hello"
            },
            from: 12, // parentStart(10) + offset(2)
            to: 12,
          },
          tr: mockTr,
        },
        view: { dispatch: jest.fn() },
      };

      const { TextSelection } = require("@tiptap/pm/state");
      const createSpy = jest.spyOn(TextSelection, "create").mockReturnValue({});

      const result = shortcuts["Mod-d"]({ editor: mockEditor });
      expect(result).toBe(true);
      // wordStart = parentStart(10) + match.index(0) = 10
      // wordEnd = parentStart(10) + match.index(0) + "hello".length(5) = 15
      expect(createSpy).toHaveBeenCalledWith(mockTr.doc, 10, 15);
      createSpy.mockRestore();
    }
  });

  it("Mod-d returns false if selection is not collapsed", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: { parent: { textContent: "hello" }, parentOffset: 2 },
            from: 10,
            to: 15, // selection exists
          },
        },
      };
      expect(shortcuts["Mod-d"]({ editor: mockEditor })).toBe(false);
    }
  });

  it("Mod-d returns true when no word found at cursor", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});
      const mockEditor = {
        state: {
          selection: {
            $from: {
              parent: { textContent: "   " }, // only spaces
              parentOffset: 1,
            },
            from: 11,
            to: 11,
          },
          tr: { setSelection: jest.fn(), doc: {} },
        },
        view: { dispatch: jest.fn() },
      };
      expect(shortcuts["Mod-d"]({ editor: mockEditor })).toBe(true);
    }
  });
});

describe("editorExtensions coverage - VS Code block movement shortcuts", () => {
  beforeEach(() => {
    (window as any).__vscode = true;
  });

  afterEach(() => {
    delete (window as any).__vscode;
  });

  it("Alt-ArrowUp moves block up (when __vscode is set)", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Alt-ArrowUp"]) {
        const curNode = { nodeSize: 10, copy: jest.fn().mockReturnValue({ type: "copy" }), content: "content" };
        const prevNode = { nodeSize: 8, copy: jest.fn(), content: "prev-content" };
        const mockTr = {
          replaceWith: jest.fn(),
          setSelection: jest.fn(),
          scrollIntoView: jest.fn().mockReturnThis(),
          doc: { resolve: jest.fn().mockReturnValue({}) },
        };
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(10),
                node: jest.fn().mockReturnValue(curNode),
              },
            },
            doc: {
              resolve: jest.fn().mockReturnValue({
                before: jest.fn().mockReturnValue(2),
                node: jest.fn().mockReturnValue(prevNode),
              }),
            },
            tr: mockTr,
          },
          view: { dispatch: jest.fn() },
        };

        const { TextSelection, Fragment } = require("@tiptap/pm/state");
        jest.spyOn(TextSelection, "near").mockReturnValue({});

        const result = shortcuts["Alt-ArrowUp"]({ editor: mockEditor });
        expect(result).toBe(true);
        expect(mockTr.replaceWith).toHaveBeenCalled();
      }
    }
  });

  it("Alt-ArrowUp returns false at doc start", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Alt-ArrowUp"]) {
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(0), // at start
                node: jest.fn().mockReturnValue({ nodeSize: 10 }),
              },
            },
          },
        };
        expect(shortcuts["Alt-ArrowUp"]({ editor: mockEditor })).toBe(false);
      }
    }
  });

  it("Alt-ArrowDown moves block down", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Alt-ArrowDown"]) {
        const curNode = { nodeSize: 10 };
        const nextNode = { nodeSize: 8 };
        const mockTr = {
          replaceWith: jest.fn(),
          setSelection: jest.fn(),
          scrollIntoView: jest.fn().mockReturnThis(),
          doc: { resolve: jest.fn().mockReturnValue({}), content: { size: 100 } },
        };
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(5),
                node: jest.fn().mockReturnValue(curNode),
              },
            },
            doc: {
              content: { size: 100 },
              resolve: jest.fn().mockReturnValue({
                node: jest.fn().mockReturnValue(nextNode),
              }),
            },
            tr: mockTr,
          },
          view: { dispatch: jest.fn() },
        };

        const { TextSelection } = require("@tiptap/pm/state");
        jest.spyOn(TextSelection, "near").mockReturnValue({});

        const result = shortcuts["Alt-ArrowDown"]({ editor: mockEditor });
        expect(result).toBe(true);
      }
    }
  });

  it("Alt-ArrowDown returns false at doc end", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Alt-ArrowDown"]) {
        const curNode = { nodeSize: 10 };
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(90),
                node: jest.fn().mockReturnValue(curNode),
              },
            },
            doc: { content: { size: 100 } },
          },
        };
        expect(shortcuts["Alt-ArrowDown"]({ editor: mockEditor })).toBe(false);
      }
    }
  });

  it("Shift-Alt-ArrowUp duplicates block above", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Shift-Alt-ArrowUp"]) {
        const curNode = { nodeSize: 10, copy: jest.fn().mockReturnValue({ type: "copy" }), content: "c" };
        const mockTr = {
          insert: jest.fn(),
          setSelection: jest.fn(),
          scrollIntoView: jest.fn().mockReturnThis(),
          doc: { resolve: jest.fn().mockReturnValue({}) },
        };
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(5),
                node: jest.fn().mockReturnValue(curNode),
              },
            },
            tr: mockTr,
          },
          view: { dispatch: jest.fn() },
        };

        const { TextSelection } = require("@tiptap/pm/state");
        jest.spyOn(TextSelection, "near").mockReturnValue({});

        const result = shortcuts["Shift-Alt-ArrowUp"]({ editor: mockEditor });
        expect(result).toBe(true);
        expect(mockTr.insert).toHaveBeenCalledWith(5, { type: "copy" });
      }
    }
  });

  it("Shift-Alt-ArrowDown duplicates block below", () => {
    const extensions = getBaseExtensions();
    const ext = extensions.find((e: any) => (e.name || e.config?.name) === "disableFormattingShortcuts") as any;

    if (ext.config?.addKeyboardShortcuts) {
      const shortcuts = ext.config.addKeyboardShortcuts.call({});

      if (shortcuts["Shift-Alt-ArrowDown"]) {
        const curNode = { nodeSize: 10, copy: jest.fn().mockReturnValue({ type: "copy" }), content: "c" };
        const mockTr = {
          insert: jest.fn(),
          setSelection: jest.fn(),
          scrollIntoView: jest.fn().mockReturnThis(),
          doc: { resolve: jest.fn().mockReturnValue({}) },
        };
        const mockEditor = {
          state: {
            selection: {
              $from: {
                before: jest.fn().mockReturnValue(5),
                node: jest.fn().mockReturnValue(curNode),
              },
            },
            tr: mockTr,
          },
          view: { dispatch: jest.fn() },
        };

        const { TextSelection } = require("@tiptap/pm/state");
        jest.spyOn(TextSelection, "near").mockReturnValue({});

        const result = shortcuts["Shift-Alt-ArrowDown"]({ editor: mockEditor });
        expect(result).toBe(true);
        expect(mockTr.insert).toHaveBeenCalledWith(15, { type: "copy" }); // pos(5) + nodeSize(10)
      }
    }
  });
});
