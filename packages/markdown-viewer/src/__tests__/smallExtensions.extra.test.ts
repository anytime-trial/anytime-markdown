/**
 * 小規模 TipTap 拡張のテスト
 * - CustomTable (tableExtension.ts)
 * - GifBlock (extensions/gifExtension.ts)
 * - CustomImage (imageExtension.ts)
 * - CustomTableCell / CustomTableHeader (extensions/customTableCells.ts)
 */

// React / ReactNodeViewRenderer モック
jest.mock("@anytime-markdown/markdown-react", () => ({
  ReactNodeViewRenderer: jest.fn(() => jest.fn()),
}));

// NodeView コンポーネントモック
jest.mock("../TableNodeView", () => ({ TableNodeView: () => null }));
jest.mock("../components/GifBlockContent", () => ({ createGifBlockNodeView: () => ({ dom: null }) }));
jest.mock("../ImageNodeView", () => ({ ImageNodeView: () => null }));

import { CustomTable } from "../tableExtension";
import { GifBlock } from "../extensions/gifExtension";
import { CustomImage } from "../imageExtension";
import {
  CustomTableCell,
  CustomTableHeader,
} from "../extensions/customTableCells";
import {
  createMockSerializerState,
  getAttributes,
  getStorage,
} from "../testUtils/extensionTestHelpers";

// ===========================================================================
// CustomTable
// ===========================================================================

describe("CustomTable (tableExtension)", () => {
  it("has name 'table'", () => {
    expect(CustomTable.name).toBe("table");
  });

  it("is draggable", () => {
    expect(CustomTable.config.draggable).toBe(true);
  });

  it("adds collapsed attribute with default false", () => {
    const attrs = getAttributes(CustomTable);
    expect(attrs.collapsed).toEqual({ default: false, rendered: false });
  });

  it("defines addNodeView", () => {
    expect(CustomTable.config.addNodeView).toBeDefined();
  });

  describe("markdown serializer", () => {
    it("serializes a simple table", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      // 2x2 table: header row + data row
      const headerCell = (text: string, align?: string) => ({
        firstChild: { textContent: text },
        textContent: text,
        attrs: { textAlign: align || null },
      });
      const headerRow = {
        forEach: (cb: Function) => {
          [headerCell("A"), headerCell("B")].forEach((c, _p, _arr) =>
            cb(c, 0, _arr.indexOf(c)),
          );
        },
      };
      const dataCell = (text: string) => ({
        firstChild: { textContent: text },
        textContent: text,
        attrs: { textAlign: null },
      });
      const dataRow = {
        forEach: (cb: Function) => {
          [dataCell("1"), dataCell("2")].forEach((c, _p, _arr) =>
            cb(c, 0, _arr.indexOf(c)),
          );
        },
      };
      const node = {
        forEach: (cb: Function) => {
          [headerRow, dataRow].forEach((r, _p, _arr) =>
            cb(r, 0, _arr.indexOf(r)),
          );
        },
      };

      storage.markdown.serialize(state, node);
      const output = state.output;
      expect(output).toContain("| A | B |");
      expect(output).toContain("| --- | --- |");
      expect(output).toContain("| 1 | 2 |");
    });

    it("serializes center-aligned column delimiter", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cell = (text: string, align: string | null) => ({
        firstChild: { textContent: text },
        textContent: text,
        attrs: { textAlign: align },
      });
      const row = {
        forEach: (cb: Function) => {
          [cell("X", "center")].forEach((c, _p, _arr) =>
            cb(c, 0, _arr.indexOf(c)),
          );
        },
      };
      const node = {
        forEach: (cb: Function) => {
          [row].forEach((r, _p, _arr) => cb(r, 0, _arr.indexOf(r)));
        },
      };

      storage.markdown.serialize(state, node);
      expect(state.output).toContain(":---:");
    });

    it("serializes right-aligned column delimiter", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cell = (text: string, align: string | null) => ({
        firstChild: { textContent: text },
        textContent: text,
        attrs: { textAlign: align },
      });
      const row = {
        forEach: (cb: Function) => {
          [cell("X", "right")].forEach((c, _p, _arr) =>
            cb(c, 0, _arr.indexOf(c)),
          );
        },
      };
      const node = {
        forEach: (cb: Function) => {
          [row].forEach((r, _p, _arr) => cb(r, 0, _arr.indexOf(r)));
        },
      };

      storage.markdown.serialize(state, node);
      expect(state.output).toContain("---:");
    });

    it("handles empty cell content", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cell = {
        firstChild: { textContent: "  " },
        textContent: "  ",
        attrs: { textAlign: null },
      };
      const row = {
        forEach: (cb: Function) => cb(cell, 0, 0),
      };
      const node = {
        forEach: (cb: Function) => cb(row, 0, 0),
      };

      storage.markdown.serialize(state, node);
      // Should not crash; empty content is skipped
      expect(state.output).toContain("|");
    });

    it("sets and resets inTable flag", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cell = {
        firstChild: { textContent: "x" },
        textContent: "x",
        attrs: { textAlign: null },
      };
      const row = { forEach: (cb: Function) => cb(cell, 0, 0) };
      const node = { forEach: (cb: Function) => cb(row, 0, 0) };

      expect(state.inTable).toBe(false);
      storage.markdown.serialize(state, node);
      expect(state.inTable).toBe(false);
    });

    it("parse is empty object", () => {
      const storage = getStorage(CustomTable);
      expect(storage.markdown.parse).toEqual({});
    });

    it("escapes `|` inside cell text to avoid GFM cell-delimiter conflict", () => {
      // Regression: tiptap-markdown の table serializer は state.renderInline に渡された
      // セル本文の `|` をエスケープしないため、round-trip でセル区切りとして再解釈され
      // 表構造が破壊される。本拡張は renderInline 書込範囲のみを `\|` にエスケープする。
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cellWithPipes = {
        firstChild: { textContent: "|ノ|ー|ド|" },
        textContent: "|ノ|ー|ド|",
        attrs: { textAlign: null },
      };
      const row = { forEach: (cb: Function) => cb(cellWithPipes, 0, 0) };
      const node = { forEach: (cb: Function) => cb(row, 0, 0) };

      storage.markdown.serialize(state, node);
      // セル境界 `| ` `|` は素のまま、本文中の `|` だけ `\|` にエスケープされる
      expect(state.out).toContain(String.raw`\|ノ\|ー\|ド\|`);
      // 既にエスケープ済みの `\|` は二重エスケープしない
      expect(state.out).not.toContain(String.raw`\\|`);
    });

    it("does not double-escape `|` that is already preceded by a backslash", () => {
      const storage = getStorage(CustomTable);
      const state = createMockSerializerState();

      const cell = {
        firstChild: { textContent: String.raw`a\|b` },
        textContent: String.raw`a\|b`,
        attrs: { textAlign: null },
      };
      const row = { forEach: (cb: Function) => cb(cell, 0, 0) };
      const node = { forEach: (cb: Function) => cb(row, 0, 0) };

      storage.markdown.serialize(state, node);
      // `\|` は既に escape 済み扱いとして保持する
      expect(state.out).toContain(String.raw`a\|b`);
      expect(state.out).not.toContain(String.raw`a\\|b`);
    });
  });
});

// ===========================================================================
// GifBlock
// ===========================================================================

describe("GifBlock (gifExtension)", () => {
  it("has name 'gifBlock'", () => {
    expect(GifBlock.name).toBe("gifBlock");
  });

  it("belongs to block group", () => {
    expect(GifBlock.config.group).toBe("block");
  });

  it("is draggable", () => {
    expect(GifBlock.config.draggable).toBe(true);
  });

  it("is atom", () => {
    expect(GifBlock.config.atom).toBe(true);
  });

  describe("attributes", () => {
    it("has src attribute (default null)", () => {
      const attrs = getAttributes(GifBlock);
      expect(attrs.src).toEqual({ default: null });
    });

    it("has alt attribute (default empty string)", () => {
      const attrs = getAttributes(GifBlock);
      expect(attrs.alt).toEqual({ default: "" });
    });

    it("has width attribute (default null)", () => {
      const attrs = getAttributes(GifBlock);
      expect(attrs.width).toEqual({ default: null });
    });

    it("has gifSettings attribute with parseHTML/renderHTML", () => {
      const attrs = getAttributes(GifBlock);
      expect(attrs.gifSettings).toBeDefined();
      expect(attrs.gifSettings.default).toBeNull();
    });

    it("gifSettings parseHTML reads data-gif-settings", () => {
      const attrs = getAttributes(GifBlock);
      const el = { dataset: { gifSettings: '{"fps":10}' } } as unknown as HTMLElement;
      expect(attrs.gifSettings.parseHTML(el)).toBe('{"fps":10}');
    });

    it("gifSettings parseHTML returns null when absent", () => {
      const attrs = getAttributes(GifBlock);
      const el = { dataset: {} } as unknown as HTMLElement;
      expect(attrs.gifSettings.parseHTML(el)).toBeNull();
    });

    it("gifSettings renderHTML returns data attribute", () => {
      const attrs = getAttributes(GifBlock);
      const result = attrs.gifSettings.renderHTML({ gifSettings: '{"fps":10}' });
      expect(result).toEqual({ "data-gif-settings": '{"fps":10}' });
    });

    it("gifSettings renderHTML returns empty when null", () => {
      const attrs = getAttributes(GifBlock);
      const result = attrs.gifSettings.renderHTML({ gifSettings: null });
      expect(result).toEqual({});
    });
  });

  describe("parseHTML", () => {
    it("defines parseHTML rules", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      expect(rules).toHaveLength(2);
    });

    it("first rule matches img[data-gif-settings]", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      expect(rules[0].tag).toBe("img[data-gif-settings]");
    });

    it("first rule getAttrs extracts attributes", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      const el = {
        getAttribute: (name: string) => {
          if (name === "src") return "test.gif";
          if (name === "alt") return "alt text";
          if (name === "width") return "200";
          return null;
        },
        dataset: { gifSettings: '{"fps":5}' },
      } as unknown as HTMLElement;
      const attrs = rules[0].getAttrs(el);
      expect(attrs).toEqual({
        src: "test.gif",
        alt: "alt text",
        width: "200",
        gifSettings: '{"fps":5}',
      });
    });

    it("second rule matches img[src$='.gif']", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      expect(rules[1].tag).toBe('img[src$=".gif"]');
    });

    it("second rule getAttrs extracts from .gif src", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      const el = {
        getAttribute: (name: string) => {
          if (name === "src") return "animation.gif";
          if (name === "alt") return "gif alt";
          if (name === "width") return null;
          return null;
        },
      } as unknown as HTMLElement;
      const attrs = rules[1].getAttrs(el);
      expect(attrs).toEqual({
        src: "animation.gif",
        alt: "gif alt",
        width: null,
      });
    });

    it("second rule returns false for non-.gif src", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      const el = {
        getAttribute: (name: string) => {
          if (name === "src") return "image.png";
          return null;
        },
      } as unknown as HTMLElement;
      const attrs = rules[1].getAttrs(el);
      expect(attrs).toBe(false);
    });

    it("second rule returns false for null src", () => {
      const parseHTML = GifBlock.config.parseHTML as Function;
      const rules = parseHTML.call({});
      const el = {
        getAttribute: () => null,
      } as unknown as HTMLElement;
      const attrs = rules[1].getAttrs(el);
      expect(attrs).toBe(false);
    });
  });

  describe("renderHTML", () => {
    it("returns img tag", () => {
      const renderHTML = GifBlock.config.renderHTML as Function;
      const result = renderHTML.call({}, { HTMLAttributes: { src: "test.gif" } });
      expect(result[0]).toBe("img");
      expect(result[1].src).toBe("test.gif");
    });
  });

  describe("markdown serializer", () => {
    it("serializes to ![alt](src)", () => {
      const storage = getStorage(GifBlock);
      const state = createMockSerializerState();
      const node = {
        attrs: { src: "anim.gif", alt: "my gif" },
      };

      storage.markdown.serialize(state, node);
      expect(state.output).toContain("![my gif](anim.gif)");
    });

    it("handles null src and alt", () => {
      const storage = getStorage(GifBlock);
      const state = createMockSerializerState();
      const node = {
        attrs: { src: null, alt: null },
      };

      storage.markdown.serialize(state, node);
      expect(state.output).toContain("![](");
    });
  });
});

// ===========================================================================
// CustomImage
// ===========================================================================

describe("CustomImage (imageExtension)", () => {
  it("has name 'image'", () => {
    expect(CustomImage.name).toBe("image");
  });

  it("is draggable", () => {
    expect(CustomImage.config.draggable).toBe(true);
  });

  it("defines addNodeView", () => {
    expect(CustomImage.config.addNodeView).toBeDefined();
  });

  describe("storage", () => {
    it("has onEditImage default null", () => {
      const storage = getStorage(CustomImage);
      expect(storage.onEditImage).toBeNull();
    });
  });

  describe("attributes", () => {
    it("adds collapsed attribute (default false)", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.collapsed).toEqual({ default: false, rendered: false });
    });

    it("has width attribute with parseHTML/renderHTML", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.width).toBeDefined();
      expect(attrs.width.default).toBeNull();
    });

    it("width parseHTML reads width attribute", () => {
      const attrs = getAttributes(CustomImage);
      const el = {
        getAttribute: (name: string) => (name === "width" ? "300" : null),
        style: { width: "" },
      } as unknown as HTMLElement;
      expect(attrs.width.parseHTML(el)).toBe("300");
    });

    it("width parseHTML falls back to style.width", () => {
      const attrs = getAttributes(CustomImage);
      const el = {
        getAttribute: () => null,
        style: { width: "50%" },
      } as unknown as HTMLElement;
      expect(attrs.width.parseHTML(el)).toBe("50%");
    });

    it("width parseHTML returns null when no width", () => {
      const attrs = getAttributes(CustomImage);
      const el = {
        getAttribute: () => null,
        style: { width: "" },
      } as unknown as HTMLElement;
      expect(attrs.width.parseHTML(el)).toBeNull();
    });

    it("width renderHTML returns width attr", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.width.renderHTML({ width: "400" })).toEqual({ width: "400" });
    });

    it("width renderHTML returns empty when null", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.width.renderHTML({ width: null })).toEqual({});
    });

    it("has annotations attribute with parseHTML/renderHTML", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.annotations).toBeDefined();
      expect(attrs.annotations.default).toBeNull();
    });

    it("annotations parseHTML reads data-annotations", () => {
      const attrs = getAttributes(CustomImage);
      const el = {
        dataset: { annotations: '[{"x":10}]' },
      } as unknown as HTMLElement;
      expect(attrs.annotations.parseHTML(el)).toBe('[{"x":10}]');
    });

    it("annotations parseHTML returns null when absent", () => {
      const attrs = getAttributes(CustomImage);
      const el = { dataset: {} } as unknown as HTMLElement;
      expect(attrs.annotations.parseHTML(el)).toBeNull();
    });

    it("annotations renderHTML returns data attribute", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.annotations.renderHTML({ annotations: "[1,2]" })).toEqual({
        "data-annotations": "[1,2]",
      });
    });

    it("annotations renderHTML returns empty when null", () => {
      const attrs = getAttributes(CustomImage);
      expect(attrs.annotations.renderHTML({ annotations: null })).toEqual({});
    });
  });
});

// ===========================================================================
// CustomTableCell / CustomTableHeader
// ===========================================================================

describe("CustomTableCell (customTableCells)", () => {
  it("has name 'tableCell'", () => {
    expect(CustomTableCell.name).toBe("tableCell");
  });

  describe("textAlign attribute", () => {
    it("has default null", () => {
      const attrs = getAttributes(CustomTableCell);
      expect(attrs.textAlign.default).toBeNull();
    });

    it("parseHTML reads style.textAlign", () => {
      const attrs = getAttributes(CustomTableCell);
      const el = { style: { textAlign: "center" } } as unknown as HTMLElement;
      expect(attrs.textAlign.parseHTML(el)).toBe("center");
    });

    it("parseHTML returns null when no textAlign", () => {
      const attrs = getAttributes(CustomTableCell);
      const el = { style: { textAlign: "" } } as unknown as HTMLElement;
      expect(attrs.textAlign.parseHTML(el)).toBeNull();
    });

    it("renderHTML returns style with text-align", () => {
      const attrs = getAttributes(CustomTableCell);
      expect(attrs.textAlign.renderHTML({ textAlign: "right" })).toEqual({
        style: "text-align: right",
      });
    });

    it("renderHTML returns empty when null", () => {
      const attrs = getAttributes(CustomTableCell);
      expect(attrs.textAlign.renderHTML({ textAlign: null })).toEqual({});
    });
  });
});

describe("CustomTableHeader (customTableCells)", () => {
  it("has name 'tableHeader'", () => {
    expect(CustomTableHeader.name).toBe("tableHeader");
  });

  describe("textAlign attribute", () => {
    it("has default null", () => {
      const attrs = getAttributes(CustomTableHeader);
      expect(attrs.textAlign.default).toBeNull();
    });

    it("parseHTML reads style.textAlign", () => {
      const attrs = getAttributes(CustomTableHeader);
      const el = { style: { textAlign: "left" } } as unknown as HTMLElement;
      expect(attrs.textAlign.parseHTML(el)).toBe("left");
    });

    it("parseHTML returns null when no textAlign", () => {
      const attrs = getAttributes(CustomTableHeader);
      const el = { style: { textAlign: "" } } as unknown as HTMLElement;
      expect(attrs.textAlign.parseHTML(el)).toBeNull();
    });

    it("renderHTML returns style with text-align", () => {
      const attrs = getAttributes(CustomTableHeader);
      expect(attrs.textAlign.renderHTML({ textAlign: "center" })).toEqual({
        style: "text-align: center",
      });
    });

    it("renderHTML returns empty when null", () => {
      const attrs = getAttributes(CustomTableHeader);
      expect(attrs.textAlign.renderHTML({ textAlign: null })).toEqual({});
    });
  });

  describe("renderHTML", () => {
    it("renders th with scope='col'", () => {
      const renderHTML = CustomTableHeader.config.renderHTML as Function;
      const result = renderHTML.call({}, { HTMLAttributes: { class: "test" } });
      expect(result[0]).toBe("th");
      expect(result[1].scope).toBe("col");
      expect(result[1].class).toBe("test");
      expect(result[2]).toBe(0);
    });
  });
});
