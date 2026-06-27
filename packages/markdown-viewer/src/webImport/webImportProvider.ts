/**
 * webImportProvider.ts - Web page import fetch provider registry.
 *
 * consumer (web-app / vscode webview) injects the actual fetch implementation.
 * When unset, web page import is unavailable.
 *
 * React Context independent module-level singleton.
 */

export interface WebImportFetchResult {
  html: string;
  finalUrl: string;
  contentType?: string;
}

export interface WebImportProvider {
  fetch(url: string): Promise<WebImportFetchResult>;
}

export type WebImportProviderChangeListener = (provider: WebImportProvider | null) => void;

let _provider: WebImportProvider | null = null;
const listeners = new Set<WebImportProviderChangeListener>();

export function setWebImportProvider(provider: WebImportProvider | null): void {
  _provider = provider;
  for (const listener of listeners) {
    try {
      listener(_provider);
    } catch (error: unknown) {
      console.error("[webImportProvider] listener failed", error);
    }
  }
}

export function getWebImportProvider(): WebImportProvider | null {
  return _provider;
}

export function subscribeWebImportProvider(
  listener: WebImportProviderChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
