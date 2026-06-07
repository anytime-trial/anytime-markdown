import type { ReactElement, Ref } from "react";

/** ref を受け取れる単一子要素（cloneElement で ref を差し込む overlay 系で使用）。 */
export type ChildWithRef = ReactElement<Record<string, unknown>> & { ref?: Ref<HTMLElement> };

/** function ref / object ref の双方へノードを代入する。Tooltip / ClickAwayListener など
 *  子要素の既存 ref を保持しつつ自前 ref も張る overlay プリミティブで共有する。 */
export function assignRef(ref: Ref<HTMLElement> | undefined, node: HTMLElement | null): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    (ref as { current: HTMLElement | null }).current = node;
  }
}
