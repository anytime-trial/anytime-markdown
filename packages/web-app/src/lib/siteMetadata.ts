/**
 * サイト共通のメタデータ定数。
 *
 * ルート layout の title.template と、template が適用されない openGraph / twitter の
 * タイトルを 1 箇所から導出するために置く。サフィックス文言を変えたときに OG カードだけ
 * 旧文言のまま残る事故を防ぐ。
 */

export const SITE_NAME = 'Anytime Markdown';

/** ルート layout の title.template。ページは素のタイトルだけを持つ。 */
export const TITLE_TEMPLATE = `%s - ${SITE_NAME}` as const;

/** 検索結果で切られない長さ（160 字以内）に収める */
export const SITE_DESCRIPTION =
  'Browser-based WYSIWYG Markdown editor for Spec-Driven Development. Mermaid and PlantUML diagrams, KaTeX math, diff and merge, Git integration. No sign-up.';

/**
 * openGraph / twitter 用のタイトルを組み立てる。
 * これらは title.template の適用対象外なので、完全形を明示的に作る必要がある。
 */
export function socialTitle(pageTitle: string): string {
  return TITLE_TEMPLATE.replace('%s', pageTitle);
}
