// content.js - Injected into music.apple.com
// Bridges the background worker and the page-scoped injected script via postMessage.

// Injects page-scope script
(function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
})();

// Listen for messages from injected.js
window.addEventListener('message', (event) => {
  // Only accept messages from our own page
  if (event.source !== window) return;
  if (!event.data || !event.data.type) return;

  if (event.data.type === 'MUSIC_STATE') {
    try {
      chrome.runtime.sendMessage(event.data).catch(() => {});
    } catch (_) {
      // Extension reloaded, refresh the page to reconnect
    }
  }
});

// Listens for commands from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['PLAY', 'PAUSE', 'TOGGLE_PLAY', 'NEXT', 'PREV', 'SEEK', 'SET_VOLUME', 'SET_REPEAT', 'SET_SHUFFLE'].includes(message.type)) {
    // Forwards command into the page scope so injected.js can act on it
    window.postMessage(message, '*');
    sendResponse({ ok: true });
  }
  return true;
});
