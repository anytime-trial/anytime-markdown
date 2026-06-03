import { useEffect, useState } from 'react';

import type { TrailPromptEntry } from '../domain/parser/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptsDataResult {
  readonly prompts: readonly TrailPromptEntry[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePromptsData(serverUrl: string, enabled = true): PromptsDataResult {
  const [prompts, setPrompts] = useState<readonly TrailPromptEntry[]>([]);

  const baseUrl = serverUrl;

  useEffect(() => {
    // プロンプトポップアップ未オープンの間は取得しない（起動時過剰取得の回避）。
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/prompts`, { signal: controller.signal });
        if (res.ok) {
          const data: unknown = await res.json();
          if (controller.signal.aborted) return;
          if (data && typeof data === 'object' && 'prompts' in data) {
            setPrompts((data as { prompts: readonly TrailPromptEntry[] }).prompts);
          }
        }
      } catch {
        // prompts endpoint may not exist / aborted
      }
    })();
    return () => controller.abort();
  }, [enabled, baseUrl]);

  return { prompts };
}
