export const useTranslations = () => (key: string, values?: Record<string, unknown>) => {
  if (values && Object.keys(values).length > 0) {
    return `${key}:${JSON.stringify(values)}`;
  }
  return key;
};

export const useLocale = () => "ja";
export const useMessages = () => ({});
export const useFormatter = () => ({
  dateTime: (d: Date) => d.toISOString(),
  number: (n: number) => String(n),
});
