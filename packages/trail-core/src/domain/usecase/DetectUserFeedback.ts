// Phase 6 S2 (User Feedback Logging): 「前の出力を修正する指示」の判定の正本。
// UserPromptSubmit フック（vscode-common claudeHookSetup の user-feedback.sh）は
// 本パターンの軽量プレフィルタ複製を持つが、採否はサーバー経由で本関数が最終判定する。
// 和文パターンは部分一致（日本語に単語境界は無い）、latin パターンのみ \b を使う。

export interface UserFeedbackMatch {
  matchedPattern: string;
}

const FEEDBACK_PATTERNS: ReadonlyArray<{ id: string; regex: RegExp }> = [
  { id: 'やり直し', regex: /やり直|やりなおし/ },
  { id: '違う', regex: /違う|違います/ },
  { id: 'ではなく', regex: /ではなく/ },
  { id: '戻して', regex: /戻して/ },
  { id: '間違', regex: /間違/ },
  { id: 'revert', regex: /\brevert\b/i },
];

export function detectUserFeedback(prompt: string): UserFeedbackMatch | null {
  if (prompt === '') return null;
  for (const pattern of FEEDBACK_PATTERNS) {
    if (pattern.regex.test(prompt)) {
      return { matchedPattern: pattern.id };
    }
  }
  return null;
}
