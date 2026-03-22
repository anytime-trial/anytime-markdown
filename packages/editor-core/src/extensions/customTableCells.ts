import { TableCell, TableHeader } from "@tiptap/extension-table";

/** textAlign 属性付きの TableCell 拡張 */
export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.textAlign || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.textAlign) return {};
          return { style: `text-align: ${String(attributes.textAlign)}` };
        },
      },
    };
  },
});

/** textAlign 属性 + scope="col" 付きの TableHeader 拡張 */
export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      textAlign: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.textAlign || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.textAlign) return {};
          return { style: `text-align: ${String(attributes.textAlign)}` };
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["th", { ...HTMLAttributes, scope: "col" }, 0];
  },
});
