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

// 子孫要素（pre/code/table/a/blockquote/h*）の装飾。旧 src/ui の injectTrailUiStyles から
// 当該ルールのみを移設し、ローカルで 1 度だけ注入する（テーマ変数 --trv-color-* は
// applyTrailThemeVars が documentElement に注入済み）。
const PREVIEW_STYLE_ID = 'trail-prompt-markdown-preview-style';
const PREVIEW_CSS = `
.prompt-markdown-preview pre { overflow: auto; padding: 12px; border-radius: 4px; background: var(--trv-color-action-hover); font-size: 13px; }
.prompt-markdown-preview code { font-family: monospace; font-size: 0.9em; }
.prompt-markdown-preview :not(pre) > code { padding: 2px 4px; border-radius: 4px; background: var(--trv-color-action-hover); }
.prompt-markdown-preview table { border-collapse: collapse; width: 100%; }
.prompt-markdown-preview th, .prompt-markdown-preview td { border: 1px solid var(--trv-color-divider); padding: 4px 8px; }
.prompt-markdown-preview blockquote { border-left: 4px solid var(--trv-color-divider); margin-left: 0; padding-left: 16px; color: var(--trv-color-text-secondary); }
.prompt-markdown-preview img { max-width: 100%; }
.prompt-markdown-preview a { color: var(--trv-color-primary-main); }
.prompt-markdown-preview h1, .prompt-markdown-preview h2, .prompt-markdown-preview h3, .prompt-markdown-preview h4, .prompt-markdown-preview h5, .prompt-markdown-preview h6 { margin-top: 16px; margin-bottom: 8px; line-height: 1.3; }
`;

function ensurePreviewStyle(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PREVIEW_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PREVIEW_STYLE_ID;
    style.textContent = PREVIEW_CSS;
    document.head.appendChild(style);
}

/**
 * プロンプトの読み取り専用 Markdown プレビュー（markdown preview の React island）。
 *
 * marked で Markdown → HTML に変換し、DOMPurify でサニタイズしてから描画する。
 * 軽量レンダラ（mermaid / katex 等の重量連鎖なし）。テーマは --am-color-* / --trv-color-*
 * （applyTrailThemeVars 注入）に追従する。
 */
export function LazyPromptMarkdownPreview({
    content,
    height,
}: Readonly<LazyPromptMarkdownPreviewProps>) {
    ensurePreviewStyle();
    const html = useMemo(() => {
        const rendered = marked.parse(content, { async: false });
        return DOMPurify.sanitize(rendered);
    }, [content]);

    return (
        <div
            className="prompt-markdown-preview"
            style={{
                height,
                overflow: 'auto',
                padding: '8px 16px',
                color: 'var(--am-color-text-primary)',
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: 'break-word',
            }}
            // marked 出力を DOMPurify.sanitize 済み。
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
