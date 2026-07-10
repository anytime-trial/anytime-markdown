/**
 * 上書き保存の宛先種別（ツールバーのラベル切替用）の遷移規則。
 *
 * `fileOpsController` は宛先を `"local" | "external"` の 2 値でしか通知しないため、
 * external が GitHub か Drive かはホスト（web-app 等）が持つ値が唯一の真実源になる。
 * ローカルへ「名前を付けて保存」した後の上書き保存はローカルへ行くので、種別は消える。
 */
export type ExternalSaveKind = "github" | "drive";

/**
 * 保存先の遷移後に採用する宛先種別を返す。
 *
 * @param targetKind fileOpsController が通知した新しい保存先（null は保存先なし）
 * @param hostKind ホストが保持する外部保存の宛先種別（GitHub から Drive へ移った場合はこちらが先に変わる）
 */
export function nextExternalSaveKind(
  targetKind: "local" | "external" | null,
  hostKind: ExternalSaveKind | undefined,
): ExternalSaveKind | undefined {
  return targetKind === "local" ? undefined : hostKind;
}
