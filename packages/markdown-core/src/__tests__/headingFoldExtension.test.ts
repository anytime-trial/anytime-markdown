/**
 * headingFoldExtension.ts のテスト
 * HeadingFoldExtension の構造、コマンド、Plugin state、buildDecorations をテスト
 */
import { HeadingFoldExtension, headingFoldPluginKey } from "../extensions/headingFoldExtension";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// DecorationSet.create は実際の ProseMirror ドキュメントを要求するためモック化
const mockDecorationSet = { mock: true } as unknown as DecorationSet;
const originalCreate = DecorationSet.create;

beforeEach(() => {
  DecorationSet.create = jest.fn().mockReturnValue(mockDecorationSet);
});

afterEach(() => {
  DecorationSet.create = originalCreate;
});

describe("headingFoldPluginKey", () => {
  it("is a PluginKey instance", () => {
    expect(headingFoldPluginKey).toBeInstanceOf(PluginKey);
  });
});

describe("HeadingFoldExtension", () => {
  it("has name 'headingFold'", () => {
    expect(HeadingFoldExtension.name).toBe("headingFold");
  });

  it("defines addCommands", () => {
    expect(HeadingFoldExtension.config.addCommands).toBeDefined();
  });

  it("defines addProseMirrorPlugins", () => {
    expect(HeadingFoldExtension.config.addProseMirrorPlugins).toBeDefined();
  });

  describe("addCommands", () => {
    it("returns setFoldedHeadings command", () => {
      const addCommands = HeadingFoldExtension.config.addCommands as () => Record<string, unknown>;
      const commands = addCommands.call({});
      expect(commands).toHaveProperty("setFoldedHeadings");
    });

    it("setFoldedHeadings sets meta and returns true when dispatch is provided", () => {
      const addCommands = HeadingFoldExtension.config.addCommands as () => Record<string, unknown>;
      const commands = addCommands.call({});
      const setFoldedHeadings = commands.setFoldedHeadings as (indices: Set<number>) => (ctx: any) => boolean;

      const indices = new Set([0, 2]);
      const mockTr = { setMeta: jest.fn() };
      const mockDispatch = jest.fn();

      const result = setFoldedHeadings(indices)({ tr: mockTr, dispatch: mockDispatch });

      expect(result).toBe(true);
      expect(mockTr.setMeta).toHaveBeenCalledWith(headingFoldPluginKey, indices);
    });

    it("setFoldedHeadings returns true but does not set meta when dispatch is undefined", () => {
      const addCommands = HeadingFoldExtension.config.addCommands as () => Record<string, unknown>;
      const commands = addCommands.call({});
      const setFoldedHeadings = commands.setFoldedHeadings as (indices: Set<number>) => (ctx: any) => boolean;

      const indices = new Set([1]);
      const mockTr = { setMeta: jest.fn() };

      const result = setFoldedHeadings(indices)({ tr: mockTr, dispatch: undefined });

      expect(result).toBe(true);
      expect(mockTr.setMeta).not.toHaveBeenCalled();
    });
  });

  describe("ProseMirror Plugin", () => {
    let plugin: Plugin;

    beforeEach(() => {
      const addPlugins = HeadingFoldExtension.config.addProseMirrorPlugins as () => Plugin[];
      const plugins = addPlugins.call({});
      plugin = plugins[0];
    });

    it("addProseMirrorPlugins returns an array with one plugin", () => {
      expect(plugin).toBeDefined();
    });

    it("plugin has decorations prop", () => {
      expect(plugin.props.decorations).toBeDefined();
    });

    describe("plugin state init", () => {
      it("returns empty state with no foldedIndices and empty DecorationSet", () => {
        const spec = plugin.spec.state!;
        const initState = spec.init!({} as any, {} as any);
        expect(initState.foldedIndices.size).toBe(0);
        expect(initState.decorations).toBe(DecorationSet.empty);
      });
    });

    describe("plugin state apply", () => {
      function makeDoc(nodes: Array<{ type: string; level?: number; nodeSize: number }>) {
        let totalSize = 0;
        const nodeList: any[] = [];

        for (const n of nodes) {
          const node = {
            type: { name: n.type },
            attrs: n.level !== undefined ? { level: n.level } : {},
            nodeSize: n.nodeSize,
          };
          nodeList.push({ node, pos: totalSize });
          totalSize += n.nodeSize;
        }

        return {
          content: { size: totalSize },
          forEach: (cb: (node: any, pos: number) => void) => {
            for (const item of nodeList) {
              cb(item.node, item.pos);
            }
          },
          nodeAt: (pos: number) => {
            for (const item of nodeList) {
              if (item.pos === pos) return item.node;
            }
            return null;
          },
        };
      }

      function initState() {
        const spec = plugin.spec.state!;
        return spec.init!({} as any, {} as any);
      }

      function applyMeta(doc: any, indices: Set<number>) {
        const spec = plugin.spec.state!;
        const prevState = initState();
        const mockTr = {
          getMeta: (key: any) => (key === headingFoldPluginKey ? indices : undefined),
          doc,
          docChanged: false,
        };
        return spec.apply!(mockTr as any, prevState, {} as any, {} as any);
      }

      it("updates state when meta is set with non-empty indices", () => {
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
        ]);

        const indices = new Set([0]);
        const state = applyMeta(doc, indices);

        expect(state.foldedIndices).toBe(indices);
        expect(state.decorations).toBe(mockDecorationSet);
        expect(DecorationSet.create).toHaveBeenCalled();

        // Verify decorations passed to DecorationSet.create
        const createCall = (DecorationSet.create as jest.Mock).mock.calls[0];
        expect(createCall[0]).toBe(doc);
        const decos = createCall[1] as Decoration[];
        // heading-folded on H1 + display:none on paragraph = 2
        expect(decos.length).toBe(2);
      });

      it("rebuilds decorations on docChanged when foldedIndices is non-empty", () => {
        const spec = plugin.spec.state!;

        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
        ]);

        const prevState = {
          foldedIndices: new Set([0]),
          decorations: DecorationSet.empty,
        };

        const mockTr = {
          getMeta: () => undefined,
          doc,
          docChanged: true,
        };

        const newState = spec.apply!(mockTr as any, prevState, {} as any, {} as any);
        expect(newState.foldedIndices).toBe(prevState.foldedIndices);
        expect(newState.decorations).toBe(mockDecorationSet);
        expect(DecorationSet.create).toHaveBeenCalled();
      });

      it("returns same state when no meta and no docChanged", () => {
        const spec = plugin.spec.state!;
        const prevState = initState();

        const mockTr = {
          getMeta: () => undefined,
          docChanged: false,
        };

        const newState = spec.apply!(mockTr as any, prevState, {} as any, {} as any);
        expect(newState).toBe(prevState);
      });

      it("returns same state when docChanged but foldedIndices is empty", () => {
        const spec = plugin.spec.state!;
        const prevState = initState();

        const mockTr = {
          getMeta: () => undefined,
          docChanged: true,
        };

        const newState = spec.apply!(mockTr as any, prevState, {} as any, {} as any);
        expect(newState).toBe(prevState);
      });

      it("returns empty decorations when meta is empty set (early return)", () => {
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
        ]);

        const emptySet = new Set<number>();
        const state = applyMeta(doc, emptySet);

        expect(state.foldedIndices).toBe(emptySet);
        expect(state.decorations).toBe(DecorationSet.empty);
        // DecorationSet.create should NOT be called — early return path
        expect(DecorationSet.create).not.toHaveBeenCalled();
      });

      it("folds heading and hides all following lower-level content until end", () => {
        // H1(10), paragraph(5), H2(8), paragraph(6)
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 2, nodeSize: 8 },
          { type: "paragraph", nodeSize: 6 },
        ]);

        const state = applyMeta(doc, new Set([0]));
        expect(state.decorations).toBe(mockDecorationSet);

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // 1 heading-folded + 3 hidden (paragraph, H2, paragraph)
        expect(decos.length).toBe(4);
      });

      it("stops folding at same-level heading", () => {
        // H2(10), paragraph(5), H2(8)
        const doc = makeDoc([
          { type: "heading", level: 2, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 2, nodeSize: 8 },
        ]);

        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // 1 heading-folded + 1 hidden paragraph (stops at second H2)
        expect(decos.length).toBe(2);
      });

      it("stops folding at higher-level heading", () => {
        // H2(10), paragraph(5), H1(8)
        const doc = makeDoc([
          { type: "heading", level: 2, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 1, nodeSize: 8 },
        ]);

        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // 1 heading-folded + 1 hidden paragraph (stops at H1)
        expect(decos.length).toBe(2);
      });

      it("folds only the targeted heading index (second heading)", () => {
        // H1(10), paragraph(5), H1(8)
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 1, nodeSize: 8 },
        ]);

        const state = applyMeta(doc, new Set([1]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // 1 heading-folded on second H1, nothing after to hide
        expect(decos.length).toBe(1);
      });

      it("handles nodeAt returning null (breaks while loop)", () => {
        const doc = {
          content: { size: 20 },
          forEach: (cb: (node: any, pos: number) => void) => {
            cb(
              { type: { name: "heading" }, attrs: { level: 1 }, nodeSize: 10 },
              0,
            );
          },
          nodeAt: () => null,
        };

        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // Only heading-folded, while loop breaks immediately
        expect(decos.length).toBe(1);
      });

      it("handles document with no headings (indices don't match any heading)", () => {
        const doc = makeDoc([
          { type: "paragraph", nodeSize: 5 },
          { type: "paragraph", nodeSize: 6 },
        ]);

        const state = applyMeta(doc, new Set([0]));
        // No headings match, forEach completes but no decorations pushed.
        // DecorationSet.create is still called with empty array.
        expect(DecorationSet.create).toHaveBeenCalled();
        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        expect(decos.length).toBe(0);
      });

      it("folds multiple headings simultaneously", () => {
        // H1(10), paragraph(5), H1(8), paragraph(6)
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 1, nodeSize: 8 },
          { type: "paragraph", nodeSize: 6 },
        ]);

        const state = applyMeta(doc, new Set([0, 1]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // H1[0]: heading-folded + hidden paragraph (stops at H1[1])
        // H1[1]: heading-folded + hidden paragraph
        expect(decos.length).toBe(4);
      });

      it("folds nested headings correctly (H1 > H2 > H3)", () => {
        // H1(10), H2(8), H3(6), paragraph(5)
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "heading", level: 2, nodeSize: 8 },
          { type: "heading", level: 3, nodeSize: 6 },
          { type: "paragraph", nodeSize: 5 },
        ]);

        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // heading-folded on H1 + hidden H2 + hidden H3 + hidden paragraph
        expect(decos.length).toBe(4);
      });

      it("heading at end of document with nothing to fold", () => {
        const doc = makeDoc([
          { type: "heading", level: 1, nodeSize: 10 },
        ]);

        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // Only heading-folded on the heading, no nodes after
        expect(decos.length).toBe(1);
      });

      it("non-heading nodes between headings are counted correctly", () => {
        // paragraph(5), H2(10), paragraph(6), paragraph(7), H3(8)
        const doc = makeDoc([
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 2, nodeSize: 10 },
          { type: "paragraph", nodeSize: 6 },
          { type: "paragraph", nodeSize: 7 },
          { type: "heading", level: 3, nodeSize: 8 },
        ]);

        // fold heading index 0 (first heading, which is H2)
        const state = applyMeta(doc, new Set([0]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // heading-folded on H2 + hidden paragraph + hidden paragraph + hidden H3
        expect(decos.length).toBe(4);
      });

      it("Decoration.node called with correct positions and attributes", () => {
        const nodeSpy = jest.spyOn(Decoration, "node");

        // H2(10), paragraph(5)
        const doc = makeDoc([
          { type: "heading", level: 2, nodeSize: 10 },
          { type: "paragraph", nodeSize: 5 },
        ]);

        applyMeta(doc, new Set([0]));

        // heading-folded decoration: pos=0, end=10
        expect(nodeSpy).toHaveBeenCalledWith(0, 10, { class: "heading-folded" });
        // hidden decoration: pos=10, end=15
        expect(nodeSpy).toHaveBeenCalledWith(10, 15, { style: "display: none" });

        nodeSpy.mockRestore();
      });

      it("headingIdx increments only for heading nodes", () => {
        // paragraph(5), H1(10), paragraph(6), H2(8)
        // heading indices: H1=0, H2=1
        const doc = makeDoc([
          { type: "paragraph", nodeSize: 5 },
          { type: "heading", level: 1, nodeSize: 10 },
          { type: "paragraph", nodeSize: 6 },
          { type: "heading", level: 2, nodeSize: 8 },
        ]);

        // fold heading index 1 (H2)
        const state = applyMeta(doc, new Set([1]));

        const decos = (DecorationSet.create as jest.Mock).mock.calls[0][1] as Decoration[];
        // Only heading-folded on H2, nothing after
        expect(decos.length).toBe(1);
      });
    });

    describe("decorations prop", () => {
      it("returns DecorationSet.empty when plugin state is undefined", () => {
        const decorationsFn = plugin.props.decorations!;
        const mockState = {} as any;

        const result = decorationsFn.call(plugin, mockState);
        expect(result).toBe(DecorationSet.empty);
      });
    });
  });
});
