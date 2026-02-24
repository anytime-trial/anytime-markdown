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
  // Wrap importFn to ensure the result always has a `default` export,
  // which is required by React.lazy. This handles cases where the caller
  // uses `.then(m => m.NamedExport)` which returns { default: undefined }.
  const wrappedImport = () =>
    importFn().then((mod) => {
      if (mod && typeof mod === 'object' && 'default' in mod && mod.default) {
        return mod as { default: React.ComponentType<P> };
      }
      // The importFn resolved to a component directly (via .then(m => m.X))
      const comp = mod as unknown as React.ComponentType<P>;
      return { default: comp };
    });

  const LazyComponent = React.lazy(wrappedImport);

  return function DynamicWrapper(props: P) {
    const fallback = options?.loading ? React.createElement(options.loading) : null;
    return React.createElement(
      React.Suspense,
      { fallback },
      React.createElement(LazyComponent, props),
    );
  };
}
