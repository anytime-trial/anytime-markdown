/**
 * MV3 service worker。
 *
 * ツールバーアイコン（action）に default_popup を設定していないため、クリックで
 * onClicked が発火する。エディタを新規タブ全画面で開く。
 *
 * 開いているエディタタブを再利用したい場合は `tabs` パーミッションを足して
 * chrome.tabs.query({ url: EDITOR_URL }) で既存タブを探す実装に拡張する。
 * 既定ではパーミッションを最小化するため毎回新規タブを開く。
 *
 * 右クリックメニュー「anytime-markdown で編集」は、表示中のページへ
 * pageCapture.js（dist/pageCapture.js。src/pageCapture.ts のビルド成果物）を注入し、
 * Markdown 化した本文を chrome.storage.local の `pendingImport` へ一時保存したうえで
 * editor.html?import=1 を新規タブで開く。editor.ts 側が起動時にこのキーを読み取り、
 * 取り込み後に削除する（自動保存復元より優先）。
 */
/* global chrome */

const EDITOR_IMPORT_URL = "editor.html?import=1";
const PAGE_CAPTURE_MENU_ID = "am-edit-page";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: PAGE_CAPTURE_MENU_ID,
    title: "anytime-markdown で編集",
    contexts: ["page"],
  });
});

/**
 * chrome.storage.local.set を Promise 化する。lastError は silent にせず
 * 呼び出し元へ伝播させる（副作用ラッパー。副作用レビュー観点）。
 */
function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message ?? "unknown chrome.storage.local.set error"));
        return;
      }
      resolve();
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== PAGE_CAPTURE_MENU_ID || !tab?.id) return;

  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["pageCapture.js"],
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] pageCapture injection failed for tab ${tab.id}: ` +
        (error instanceof Error ? (error.stack ?? error.message) : String(error)),
    );
    return;
  }

  const captured = injectionResults?.[0]?.result;
  if (!captured) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] pageCapture returned no result for tab ${tab.id}`,
    );
    return;
  }

  try {
    await storageSet({ pendingImport: captured });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] pendingImport 保存に失敗しました for tab ${tab.id}: ` +
        (error instanceof Error ? (error.stack ?? error.message) : String(error)),
    );
    return;
  }

  chrome.tabs.create({ url: chrome.runtime.getURL(EDITOR_IMPORT_URL) });
});
