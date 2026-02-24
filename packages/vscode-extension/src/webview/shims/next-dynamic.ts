/* next/dynamic shim for VS Code webview (webpack) */
import React from 'react';

type DynamicOptions = {
  loading?: () => React.ReactElement | null;
  ssr?: boolean;
};

export default function dynamic<P extends Record<string, unknown>>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  options?: DynamicOptions,
): React.ComponentType<P> {
  const LazyComponent = React.lazy(importFn);

  return function DynamicWrapper(props: P) {
    const fallback = options?.loading ? React.createElement(options.loading) : null;
    return React.createElement(
      React.Suspense,
      { fallback },
      React.createElement(LazyComponent, props),
    );
  };
}
