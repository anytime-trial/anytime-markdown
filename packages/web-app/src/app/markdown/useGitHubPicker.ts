'use client';

import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { consumeGitHubPickerIntent, markGitHubPickerIntent } from '../../lib/githubPickerIntent';

interface UseGitHubPickerOptions {
  /** GitHub OAuth 済みか。`undefined` はセッション未確定（useSession が loading）。 */
  isGitHubConnected: boolean | undefined;
  /** テスト用に next-auth の signIn を差し替える。 */
  signInFn?: (provider: string, options?: { callbackUrl?: string }) => Promise<unknown>;
}

interface UseGitHubPickerResult {
  gitHubPickerOpen: boolean;
  /** 「開く > GitHub から開く」の押下。未接続ならこの時点で初めて OAuth へ誘導する。 */
  handleOpenFromGitHub: () => void;
  closeGitHubPicker: () => void;
}

/**
 * GitHub リポジトリピッカーの開閉と、未接続時の OAuth 誘導を束ねる。
 * 同意画面へ抜ける前に意図を記録し、戻ってきた時点でピッカーを開くことで
 * 「押す → OAuth → 戻る → もう一度押す」の 2 度手間を防ぐ。
 */
export function useGitHubPicker({
  isGitHubConnected,
  signInFn = signIn,
}: UseGitHubPickerOptions): UseGitHubPickerResult {
  const [gitHubPickerOpen, setGitHubPickerOpen] = useState(false);

  const handleOpenFromGitHub = useCallback(() => {
    if (!isGitHubConnected) {
      markGitHubPickerIntent();
      void signInFn('github', { callbackUrl: window.location.href });
      return;
    }
    setGitHubPickerOpen(true);
  }, [isGitHubConnected, signInFn]);

  // OAuth 往復から戻ってきた場合のみ、記録した意図を消費してピッカーを開く。
  // 単なるリロード（意図なし）では開かない。
  useEffect(() => {
    if (!isGitHubConnected) return;
    if (consumeGitHubPickerIntent()) setGitHubPickerOpen(true);
  }, [isGitHubConnected]);

  const closeGitHubPicker = useCallback(() => setGitHubPickerOpen(false), []);

  return { gitHubPickerOpen, handleOpenFromGitHub, closeGitHubPicker };
}
