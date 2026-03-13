// content.js — Injected into music.apple.com
// Bridges between the background service worker and the injected page script.
// Cannot access MusicKit JS directly (isolated context), so it injects
// injected.js into the real page scope and communicates via postMessage.

// ─── Inject page-scope script ─────────────────────────────────────────────────
(function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
})();

// ─── Listen for messages from injected.js (page scope → content script) ──────
window.addEventListener('message', (event) => {
  // Only accept messages from our own page
  if (event.source !== window) return;
  if (!event.data || !event.data.type) return;

  if (event.data.type === 'MUSIC_STATE') {
    // Forward state update to background service worker
    chrome.runtime.sendMessage(event.data).catch((err) => {
      // Background may be sleeping — not critical
    });
  }
});

// ─── Listen for commands from background service worker ───────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['PLAY', 'PAUSE', 'TOGGLE_PLAY', 'NEXT', 'PREV', 'SEEK', 'SET_VOLUME'].includes(message.type)) {
    // Forward command into the page scope so injected.js can act on it
    window.postMessage(message, '*');
    sendResponse({ ok: true });
  }
  return true;
});
