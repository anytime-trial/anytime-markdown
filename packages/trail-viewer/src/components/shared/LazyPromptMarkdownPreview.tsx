import { Box, injectTrailUiStyles } from '../../ui';
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
    injectTrailUiStyles();
    const html = useMemo(() => {
        const rendered = marked.parse(content, { async: false });
        return DOMPurify.sanitize(rendered);
    }, [content]);

    // 子孫要素（pre/code/table/a/blockquote/h*）の装飾は inline style では表現できないため、
    // injectTrailUiStyles の `.prompt-markdown-preview *` ルールで適用する（CSS 変数追従）。
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
            }}
            // marked 出力を DOMPurify.sanitize 済み。
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
