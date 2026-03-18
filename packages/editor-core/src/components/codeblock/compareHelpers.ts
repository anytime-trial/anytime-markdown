/** 比較モード左側でレビューモード（読み取り専用）かどうか */
export function isReadOnlyCompareLeft(
  isCompareLeft?: boolean,
  isCompareLeftEditable?: boolean,
): boolean {
  return !!isCompareLeft && !isCompareLeftEditable;
}

/** ブロック要素のボーダー・ツールバー表示判定 */
export function shouldShowBorder(opts: {
  isSelected: boolean;
  isCompareLeft?: boolean;
  isCompareLeftEditable?: boolean;
  isEditable: boolean;
  editOpen?: boolean;
}): boolean {
  if (isReadOnlyCompareLeft(opts.isCompareLeft, opts.isCompareLeftEditable)) return false;
  if (opts.isSelected && (opts.isCompareLeftEditable || opts.isEditable)) return true;
  if (!opts.isCompareLeft && opts.isEditable && opts.editOpen) return true;
  return false;
}

/** ブロック要素のツールバー表示判定（null = 非表示） */
export function shouldShowToolbar(opts: {
  isCompareLeft?: boolean;
  isCompareLeftEditable?: boolean;
  isEditable: boolean;
}): boolean {
  if (isReadOnlyCompareLeft(opts.isCompareLeft, opts.isCompareLeftEditable)) return false;
  return opts.isEditable || !!opts.isCompareLeftEditable;
}
