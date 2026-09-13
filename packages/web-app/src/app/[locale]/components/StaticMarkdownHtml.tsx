import { Box } from '@mui/material';

/**
 * サーバで生成した記事本文 HTML を、対話ビューアが立ち上がるまでの表示として描画する。
 *
 * この要素が返す HTML が、クローラの読む唯一の本文になる（対話ビューアは
 * `ssr: false` のためサーバ側では 1 文字も描画されない）。したがって視覚的な
 * 見た目よりも、見出し・段落・リンクが要素として実在することを優先する。
 *
 * Why not DOMPurify: `dangerouslySetInnerHTML` は原則 DOMPurify を通す規約だが、
 * sanitize には DOM が必要でサーバでは動かせない。ここへ渡る文字列は
 * {@link renderMarkdownToSafeHtml} が生成しており、生 HTML を要素化せず
 * エスケープする構成のため、除去すべきタグが最初から木に入らない。
 * 生成側を変更する際はこの前提が崩れていないか確認すること。
 */
export default function StaticMarkdownHtml({ html }: Readonly<{ html: string }>) {
  return (
    <Box
      dangerouslySetInnerHTML={{ __html: html }}
      sx={{
        // design.md §3.4 の measure。report 記事は measure="wide"（60em）で描画されるため、
        // 対話ビューアへ差し替わったときに行長が動かないよう同じ値にする。
        maxWidth: '60em',
        mx: 'auto',
        px: { xs: 2, md: 0 },
        pb: 6,
        color: 'text.primary',
        // design.md §3.4: 本文 17px・行間 1.7（読み物の既定）
        fontSize: '17px',
        lineHeight: 1.7,
        wordBreak: 'break-word',
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          fontWeight: 700,
          lineHeight: 1.4,
          mt: 4,
          mb: 1.5,
        },
        // 見出しの相対サイズはエディタ本文（editorContentCss）と揃える
        '& h1': { fontSize: '2em' },
        '& h2': { fontSize: '1.5em' },
        '& h3': { fontSize: '1.25em' },
        '& h4': { fontSize: '1.1em' },
        '& p': { my: 2 },
        '& ul, & ol': { pl: 3, my: 2 },
        '& li': { my: 0.5 },
        '& a': { color: 'primary.main' },
        '& blockquote': {
          borderLeft: 4,
          borderColor: 'divider',
          pl: 2,
          ml: 0,
          my: 2,
          color: 'text.secondary',
        },
        '& code': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.875em',
        },
        '& pre': {
          bgcolor: 'action.hover',
          p: 2,
          borderRadius: 1,
          overflowX: 'auto',
        },
        '& table': {
          borderCollapse: 'collapse',
          display: 'block',
          overflowX: 'auto',
          my: 2,
        },
        '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 0.75 },
        '& img': { maxWidth: '100%', height: 'auto' },
        '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 4 },
      }}
    />
  );
}
