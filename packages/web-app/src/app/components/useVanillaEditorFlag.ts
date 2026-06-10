'use client';

/**
 * 脱React G3-2: vanilla editor 並走フラグの SSR セーフな評価。
 *
 * `isVanillaEditorEnabled()` は URL クエリ（`?vanilla=1`）を参照するため、サーバレンダと
 * クライアントで値が割れて hydration mismatch を起こし得る。初回 false で描画し、
 * マウント後に評価して切り替える（フラグ既定 OFF の並走 draft 用途なので許容）。
 */

import { isVanillaEditorEnabled } from '@anytime-markdown/markdown-viewer';
import { useEffect, useState } from 'react';

export function useVanillaEditorFlag(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(isVanillaEditorEnabled());
  }, []);
  return enabled;
}
