'use client';

const messages = {
  en: { heading: 'Something went wrong', button: 'Try again' },
  ja: { heading: 'エラーが発生しました', button: 'もう一度試す' },
} as const;

function detectLocale(): 'en' | 'ja' {
  if (typeof document !== 'undefined') {
    const match = /(?:^|;\s*)NEXT_LOCALE=(\w+)/.exec(document.cookie);
    if (match?.[1] === 'ja') return 'ja';
  }
  return 'en';
}

export default function GlobalError({ error: _error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  const locale = detectLocale();
  const t = messages[locale];

  return (
    <html lang={locale}>
      <head>
        <style>{`
          body.global-error {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #fafafa;
            color: #333;
          }
          .global-error-btn {
            padding: 0.5rem 1.5rem;
            font-size: 1rem;
            border-radius: 4px;
            border: 1px solid #ccc;
            background-color: #fff;
            color: #333;
            cursor: pointer;
          }
          @media (prefers-color-scheme: dark) {
            body.global-error {
              background-color: #1a1a1a;
              color: #e0e0e0;
            }
            .global-error-btn {
              background-color: #2a2a2a;
              color: #e0e0e0;
              border-color: #555;
            }
          }
        `}</style>
      </head>
      <body className="global-error">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
            {t.heading}
          </h2>
          <button onClick={() => reset()} className="global-error-btn">
            {t.button}
          </button>
        </div>
      </body>
    </html>
  );
}
