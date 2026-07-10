/**
 * GitHub OAuth のスコープ。
 *
 * `repo` は private / public 双方のリポジトリの読み書きを許可する。OAuth App では
 * private リポジトリを扱う手段がこれ以外に無く、リポジトリ単位の絞り込みもできない
 * （最小権限にするなら GitHub App の fine-grained permissions へ移行する必要がある）。
 *
 * `public_repo` へ戻すと `GET /user/repos` から private リポジトリが静かに消え、
 * エディタのリポジトリ一覧に出なくなる（エラーにはならない）。
 */
export const GITHUB_OAUTH_SCOPE = "repo";

/**
 * GitHub 応答の `x-oauth-scopes` ヘッダが `repo` を含むかを判定する。
 *
 * スコープ拡大前にサインインしたユーザーのトークンは `public_repo` のままで、GitHub は遡って
 * 権限を広げない。その状態では `GET /user/repos` が private を黙って除外するだけでエラーを
 * 返さないため、ヘッダで検知して再サインインを促す。
 *
 * ヘッダが無い場合（GitHub App のトークン等）は判定できないため `true` を返し、従来どおり通す。
 */
export function hasRepoScope(headerValue: string | null | undefined): boolean {
  if (headerValue == null) return true;
  return headerValue
    .split(",")
    .map((s) => s.trim())
    .includes(GITHUB_OAUTH_SCOPE);
}
