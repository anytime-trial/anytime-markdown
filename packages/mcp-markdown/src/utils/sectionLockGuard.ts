// Phase 5 S4 (要件 §22.4): 変更系ツールの Section Lock 検査（防御第 2 層）。
// PreToolUse フックが無効な環境（他 MCP クライアント・フック未設定セッション）でも
// ロック節への変更をエラー返却で拒否する。判定はゲートと同一（section-lock-core の前後比較）。

import { evaluateLockChange, hasLockedSections } from '@anytime-markdown/section-lock-core';

/**
 * before → after の変更がロック節に違反していれば throw する（MCP SDK が isError に変換）。
 * tamper（ロック外経路の逸脱検知）は書込を止めず stderr 警告のみ（要件 §22.3 と同方針）。
 */
export function assertNoLockViolation(before: string, after: string, displayPath: string): void {
  if (!hasLockedSections(before)) return;
  const { violations, tampers } = evaluateLockChange(before, after);
  if (tampers.length > 0) {
    const sections = tampers.map((t) => `${t.path}(${t.occurrence})`).join(', ');
    process.stderr.write(
      `[${new Date().toISOString()}] [WARN] [section-lock] tamper detected in ${displayPath}: ${sections}\n`,
    );
  }
  if (violations.length > 0) {
    const details = violations
      .map((v) => `${v.kind}: ${v.entry.path}(${v.entry.occurrence})`)
      .join('; ');
    throw new Error(
      `Section lock violation in ${displayPath}: ${details}. ` +
        'Locked sections are managed by humans; unlock them in the Anytime Markdown editor first.',
    );
  }
}
