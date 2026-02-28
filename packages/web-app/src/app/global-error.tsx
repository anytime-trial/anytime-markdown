'use client';

const messages = {
  en: { heading: 'Something went wrong', button: 'Try again' },
  ja: { heading: 'エラーが発生しました', button: 'もう一度試す' },
} as const;

function detectLocale(): 'en' | 'ja' {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(\w+)/);
    if (match?.[1] === 'ja') return 'ja';
  }
  return 'en';
}

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const locale = detectLocale();
  const t = messages[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#fafafa',
          color: '#333',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
            {t.heading}
          </h2>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#fff',
              cursor: 'pointer',
            }}
          >
            {t.button}
          </button>
        </div>
      </body>
    </html>
  );
}
