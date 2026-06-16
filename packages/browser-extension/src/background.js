/**
 * MV3 service worker。
 *
 * ツールバーアイコン（action）に default_popup を設定していないため、クリックで
 * onClicked が発火する。エディタを新規タブ全画面で開く。
 *
 * 開いているエディタタブを再利用したい場合は `tabs` パーミッションを足して
 * chrome.tabs.query({ url: EDITOR_URL }) で既存タブを探す実装に拡張する。
 * 既定ではパーミッションを最小化するため毎回新規タブを開く。
 */
/* global chrome */

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
});
