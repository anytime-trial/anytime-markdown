import { MarkdownCoreI18nProvider } from '@anytime-markdown/markdown-core/src/i18n/context';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Suspense } from 'react';

import { lazyWithPreload } from './lazyWithPreload';

const MarkdownEditorPage = lazyWithPreload(() =>
    import('@anytime-markdown/markdown-core/src/MarkdownEditorPage').then((m) => ({
        default: m.default,
    })),
);

export interface LazyPromptMarkdownPreviewProps {
    readonly content: string;
    readonly isDark: boolean;
    readonly locale?: string;
    readonly height: number;
    readonly contentKey?: string | number;
}

export function LazyPromptMarkdownPreview({
    content,
    isDark,
    locale,
    height,
    contentKey,
}: Readonly<LazyPromptMarkdownPreviewProps>) {
    const themeMode = isDark ? 'dark' : 'light';
    return (
        <MarkdownCoreI18nProvider locale={locale}>
            <Suspense
                fallback={
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                        }}
                    >
                        <CircularProgress size={24} />
                    </Box>
                }
            >
                <MarkdownEditorPage
                    key={contentKey ?? content.length}
                    externalContent={content}
                    readOnly
                    hideToolbar
                    hideOutline
                    hideComments
                    hideTemplates
                    hideFoldAll
                    hideSettings
                    hideFileOps
                    hideVersionInfo
                    hideStatusBar
                    themeMode={themeMode}
                    fixedEditorHeight={height}
                    defaultBlockAlign="left"
                    showFrontmatter={false}
                />
            </Suspense>
        </MarkdownCoreI18nProvider>
    );
}

export const preloadPromptMarkdownPreview = (): Promise<unknown> =>
    MarkdownEditorPage.preload();
