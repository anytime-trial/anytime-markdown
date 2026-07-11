'use client';

import { useCallback, useRef, useState } from 'react';

interface DiscardDraftConfirm {
  /** ダイアログの表示状態。 */
  open: boolean;
  /** 破棄してよいかを問い、ユーザーの選択で解決する Promise を返す。 */
  confirmDiscardDraft: () => Promise<boolean>;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * 「未保存の下書きを破棄してよいか」をダイアログで確認し、結果を Promise で返す。
 *
 * `useEditorPage` の `confirmDiscardDraft` は非同期関数を要求する。ダイアログの選択は
 * イベントとして後から届くため、resolver を保持して選択時に解決する。
 */
export function useDiscardDraftConfirm(): DiscardDraftConfirm {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((discard: boolean) => void) | null>(null);

  const confirmDiscardDraft = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const settle = useCallback((discard: boolean) => {
    setOpen(false);
    resolveRef.current?.(discard);
    resolveRef.current = null;
  }, []);

  const onDiscard = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return { open, confirmDiscardDraft, onDiscard, onCancel };
}
