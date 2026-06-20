import { Box } from '../../ui';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';

export interface LazyPromptMarkdownPreviewProps {
    readonly content: string;
    readonly isDark: boolean;
    readonly locale?: string;
    readonly height: number;
    readonly contentKey?: string | number;
}

// marked は GFM (table / strikethrough / task list) を既定で有効化する。
// tiptap ベースの MarkdownEditorPage と違い mermaid / katex / jsxgraph 等の
// リッチ描画は行わず、コードフェンスはプレーンな <pre><code> 表示にフォールバックする。
// プロンプトプレビューは読み取り専用のため、重量モジュール連鎖を避けてバンドルを軽量化する。
marked.setOptions({ gfm: true, breaks: false });

/**
 * プロンプトの読み取り専用 Markdown プレビュー。
 *
 * marked で Markdown → HTML に変換し、DOMPurify でサニタイズしてから描画する。
 * 旧実装は markdown-core の MarkdownEditorPage を lazy import していたが、
 * tiptap / mermaid / katex 等が trail-viewer の起動バンドルに inline され
 * 肥大化していたため、軽量レンダラに置き換えた。
 */
export function LazyPromptMarkdownPreview({
    content,
    height,
}: Readonly<LazyPromptMarkdownPreviewProps>) {
    const html = useMemo(() => {
        const rendered = marked.parse(content, { async: false });
        return DOMPurify.sanitize(rendered);
    }, [content]);

    return (
        <Box
            className="prompt-markdown-preview"
            sx={{
                height,
                overflow: 'auto',
                px: 2,
                py: 1,
                color: 'text.primary',
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: 'break-word',
                '& pre': {
                    overflow: 'auto',
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    fontSize: 13,
                },
                '& code': {
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                },
                '& :not(pre) > code': {
                    px: 0.5,
                    py: '2px',
                    borderRadius: '4px',
                    bgcolor: 'action.hover',
                },
                '& table': {
                    borderCollapse: 'collapse',
                    width: '100%',
                },
                '& th, & td': {
                    border: '1px solid',
                    borderColor: 'divider',
                    px: 1,
                    py: 0.5,
                },
                '& blockquote': {
                    borderLeft: '4px solid',
                    borderColor: 'divider',
                    ml: 0,
                    pl: 2,
                    color: 'text.secondary',
                },
                '& img': {
                    maxWidth: '100%',
                },
                '& a': {
                    color: 'primary.main',
                },
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                    mt: 2,
                    mb: 1,
                    lineHeight: 1.3,
                },
            }}
            // marked 出力を DOMPurify.sanitize 済み。
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
