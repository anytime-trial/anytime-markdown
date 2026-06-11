"use client";

import { Spinner } from '../../ui/Spinner';

import { useMarkdownT } from '../../i18n/context';
import { Text } from '../../ui/Text';

type FullPageLoaderProps = {
  minHeight?: string;
  ariaLabel?: string;
};

const FullPageLoader: React.FC<FullPageLoaderProps> = ({ minHeight = '60vh', ariaLabel }) => {
  const t = useMarkdownT('Common');
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
        gap: '16px',
      }}
    >
      <Spinner aria-label={ariaLabel ?? t('loading')} />
      <Text variant="body2" style={{ color: 'var(--am-color-text-secondary)', fontWeight: 600, letterSpacing: '0.02em' }}>
        Anytime Markdown
      </Text>
    </div>
  );
};

export default FullPageLoader;
