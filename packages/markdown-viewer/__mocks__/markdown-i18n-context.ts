import React from 'react';

export const useMarkdownT = () => (key: string, values?: Record<string, unknown>) => {
  if (values && Object.keys(values).length > 0) {
    return `${key}:${JSON.stringify(values)}`;
  }
  return key;
};

export const useMarkdownLocale = () => 'ja';

export const MarkdownCoreI18nProvider = ({ children }: { children: React.ReactNode }) => children;
