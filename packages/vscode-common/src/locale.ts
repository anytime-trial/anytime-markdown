/**
 * Resolve the active VS Code UI locale to a supported app locale.
 *
 * Priority: explicit override > vscode.env.language > 'en'.
 * Only 'ja' and 'en' are recognized today; other languages fall through to 'en'.
 *
 * @param override    An explicit value (e.g. from user settings) — 'ja' / 'en' / 'auto' / unset
 * @param envLanguage The raw value from `vscode.env.language` (e.g. 'ja', 'en-US')
 */
export function resolveLocale(
  override: string | undefined,
  envLanguage: string,
): 'ja' | 'en' {
  if (override === 'ja' || override === 'en') {
    return override;
  }
  return (envLanguage || '').startsWith('ja') ? 'ja' : 'en';
}
