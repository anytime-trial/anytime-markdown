import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { Providers } from './providers';
import { LocaleProvider } from './LocaleProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anytime Markdown',
  description: 'A rich markdown editor powered by Tiptap',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider serverLocale={locale}>
          <Providers>
            {children}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
