import * as fs from 'node:fs';

/**
 * tmp + rename による atomic 書き込み。失敗時は tmp 残骸を掃除して false を返す（throw しない）。
 * vscode 非依存（jest でユニットテストする）。ログは呼び出し側から warn コールバックで受ける。
 *
 * activate 時の自動実行経路（毎回走る）で使うため、rename 失敗の繰り返しで
 * `.tmp.<pid>.<ts>` 残骸がワークスペース直下に蓄積しないことを保証する。
 */
export function writeFileAtomic(
  targetPath: string,
  content: string,
  warn: (message: string) => void,
): boolean {
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, targetPath);
    return true;
  } catch (err) {
    warn(
      `atomic write failed for ${targetPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (cleanupErr) {
      warn(
        `tmp cleanup failed for ${tmpPath}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
      );
    }
    return false;
  }
}
