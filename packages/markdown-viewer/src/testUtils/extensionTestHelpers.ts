/**
 * TipTap 拡張のユニットテスト共通ヘルパー。
 *
 * markdown-core の `smallExtensions.extra.test.ts` と markdown-rich の
 * `codeBlockWithMermaid.test.ts` が共有する（重複定義を避けるため抽出）。
 */

/** addAttributes を呼んで属性定義を取得する */
export function getAttributes(ext: any): Record<string, any> {
  const addAttrs = ext.config.addAttributes;
  if (!addAttrs) return {};
  // parent を返すように context を設定
  return addAttrs.call({ parent: () => ({}) });
}

/** addStorage を呼んでストレージオブジェクトを取得する */
export function getStorage(ext: any): any {
  const addStorage = ext.config.addStorage;
  if (!addStorage) return {};
  return addStorage.call({});
}

/** Markdown シリアライズ用のモック state を作成する */
export function createMockSerializerState() {
  const state = {
    out: "" as string,
    get output() {
      return state.out;
    },
    write(text: string) {
      state.out += text;
    },
    text(text: string, _escape?: boolean) {
      state.out += text;
    },
    ensureNewLine() {
      if (!state.out.endsWith("\n")) state.out += "\n";
    },
    closeBlock(_node: any) {
      if (state.out && !state.out.endsWith("\n")) state.out += "\n";
      state.out += "\n";
    },
    renderInline(node: any) {
      state.out += node.textContent || "";
    },
    inTable: false,
  };
  return state;
}
