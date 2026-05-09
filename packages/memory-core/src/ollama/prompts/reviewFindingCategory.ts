const CATEGORIES = ['design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other'] as const;

const SYSTEM_PROMPT = `あなたはコードレビュー所見を分類するアナリストです。
以下の所見テキストを読み、最も適切なカテゴリを選択してください。

カテゴリ一覧:
- design   : UI/UXデザイン、レイアウト、カラー、タイポグラフィ
- a11y     : アクセシビリティ、ARIA、コントラスト、キーボード操作
- security : セキュリティ、XSS、SQLインジェクション、認証・認可
- perf     : パフォーマンス、レンダリング、キャッシュ、バンドルサイズ
- naming   : 命名、コーディングスタイル、可読性
- spec     : 仕様・要件への適合性
- logic    : ロジック、条件分岐、Off-by-one、例外処理
- other    : 上記に該当しない所見

JSON のみを返してください（説明不要）:
{"category": "<カテゴリ>", "confidence": <0.0〜1.0の数値>}`;

export function buildReviewCategoryPrompt(finding: { text: string; chapter?: string }): string {
  const chapterLine = finding.chapter ? `\nチャプター: ${finding.chapter}` : '';
  return `${SYSTEM_PROMPT}${chapterLine}\n\n所見テキスト:\n${finding.text}`;
}

export { CATEGORIES };
