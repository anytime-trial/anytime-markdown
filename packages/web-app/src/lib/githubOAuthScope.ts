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
