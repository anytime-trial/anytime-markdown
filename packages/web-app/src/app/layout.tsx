import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anytime Markdown Editor',
  description: 'A rich markdown editor powered by Tiptap',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
