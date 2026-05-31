import type { EditorView } from "@tiptap/pm/view";
import {
  findCellPosFromEvent,
  handleMouseDown,
  handleDoubleClick,
} from "../../plugins/tableCellMode/tableCellModeMouse";

describe("tableCellModeMouse", () => {
  describe("findCellPosFromEvent", () => {
    it("posAtCoords が null を返す場合は null を返す", () => {
      const mockView = {
        posAtCoords: jest.fn().mockReturnValue(null),
        state: { doc: { resolve: jest.fn() } },
      } as unknown as EditorView;
      const mockEvent = { clientX: 0, clientY: 0 } as MouseEvent;

      const result = findCellPosFromEvent(mockView, mockEvent);

      expect(result).toBeNull();
      expect(mockView.posAtCoords).toHaveBeenCalledWith({ left: 0, top: 0 });
    });

    it("セル外の位置では null を返す", () => {
      const mockNode = { type: { name: "paragraph" } };
      const mock$pos = {
        depth: 1,
        node: jest.fn().mockReturnValue(mockNode),
        before: jest.fn(),
      };
      const mockView = {
        posAtCoords: jest.fn().mockReturnValue({ pos: 5, inside: -1 }),
        state: { doc: { resolve: jest.fn().mockReturnValue(mock$pos) } },
      } as unknown as EditorView;
      const mockEvent = { clientX: 100, clientY: 200 } as MouseEvent;

      const result = findCellPosFromEvent(mockView, mockEvent);

      expect(result).toBeNull();
    });

    it("tableCell ノード内の位置ではセル位置を返す", () => {
      const mockCellNode = { type: { name: "tableCell" } };
      const mockParentNode = { type: { name: "tableRow" } };
      const mock$pos = {
        depth: 2,
        node: jest.fn((depth: number) =>
          depth === 2 ? mockCellNode : mockParentNode,
        ),
        before: jest.fn().mockReturnValue(10),
      };
      const mockView = {
        posAtCoords: jest.fn().mockReturnValue({ pos: 15, inside: 12 }),
        state: { doc: { resolve: jest.fn().mockReturnValue(mock$pos) } },
      } as unknown as EditorView;
      const mockEvent = { clientX: 100, clientY: 200 } as MouseEvent;

      const result = findCellPosFromEvent(mockView, mockEvent);

      expect(result).toBe(10);
      expect(mock$pos.before).toHaveBeenCalledWith(2);
    });

    it("tableHeader ノード内の位置でもセル位置を返す", () => {
      const mockHeaderNode = { type: { name: "tableHeader" } };
      const mock$pos = {
        depth: 1,
        node: jest.fn().mockReturnValue(mockHeaderNode),
        before: jest.fn().mockReturnValue(5),
      };
      const mockView = {
        posAtCoords: jest.fn().mockReturnValue({ pos: 8, inside: 6 }),
        state: { doc: { resolve: jest.fn().mockReturnValue(mock$pos) } },
      } as unknown as EditorView;
      const mockEvent = { clientX: 50, clientY: 50 } as MouseEvent;

      const result = findCellPosFromEvent(mockView, mockEvent);

      expect(result).toBe(5);
    });

    it("doc.resolve が例外を投げた場合は null を返す", () => {
      const mockView = {
        posAtCoords: jest.fn().mockReturnValue({ pos: 999, inside: -1 }),
        state: {
          doc: {
            resolve: jest.fn().mockImplementation(() => {
              throw new RangeError("Position out of range");
            }),
          },
        },
      } as unknown as EditorView;
      const mockEvent = { clientX: 0, clientY: 0 } as MouseEvent;

      const result = findCellPosFromEvent(mockView, mockEvent);

      expect(result).toBeNull();
    });
  });

  describe("exported functions", () => {
    it("handleMouseDown が関数としてエクスポートされている", () => {
      expect(typeof handleMouseDown).toBe("function");
    });

    it("handleDoubleClick が関数としてエクスポートされている", () => {
      expect(typeof handleDoubleClick).toBe("function");
    });

    it("findCellPosFromEvent が関数としてエクスポートされている", () => {
      expect(typeof findCellPosFromEvent).toBe("function");
    });
  });
});
