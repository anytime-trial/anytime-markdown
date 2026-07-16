export interface NotePageTemplateArgs {
  readonly title: string;
  readonly contextMarkdown: string;
  readonly imageRelPath?: string;
  readonly imageAlt?: string;
  readonly dateIso: string;
}

/**
 * Agent Note の新規ページ本文を組み立てる（副作用なし）。
 * trail-viewer のグラフ要素出力（add-note-page 連携）で、要素コンテキスト・
 * グラフ画像・ユーザー記入用の指示節を持つページを生成する。
 */
export function buildNotePageContent(args: NotePageTemplateArgs): string {
  const escapedTitle = args.title.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const lines = [
    '---',
    `title: "${escapedTitle}"`,
    `date: "${args.dateIso}"`,
    'type: "instruction"',
    '---',
    '',
    '## コンテキスト',
    '',
  ];
  if (args.contextMarkdown) lines.push(args.contextMarkdown, '');
  if (args.imageRelPath) lines.push(`![${args.imageAlt ?? args.title}](${args.imageRelPath})`, '');
  lines.push('## 指示', '', '<!-- ここに依頼内容を記入してください -->', '');
  return lines.join('\n');
}
