// popup.js — Controls the popup UI
// Queries the background service worker for connection status and relay URL.

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const serverUrl  = document.getElementById('serverUrl');
const copyBtn    = document.getElementById('copyBtn');
const copyFeedback = document.getElementById('copyFeedback');

// ─── Ask background for current status ───────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    setStatus(false, '—', 0);
    return;
  }
  if (response) {
    setStatus(response.connected, response.relayUrl, response.remoteCount || 0);
  }
});

// ─── Also listen for live status changes while popup is open ─────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONNECTION_STATUS') {
    setStatus(message.connected, serverUrl.textContent, message.remoteCount || 0);
  }
});

// ─── Update UI ────────────────────────────────────────────────────────────────
const remotesRow  = document.getElementById('remotesRow');
const remotesText = document.getElementById('remotesText');

function setStatus(connected, relayUrl, remoteCount) {
  if (connected) {
    statusDot.className = 'dot connected';
    statusText.textContent = 'Connected to relay server';
  } else {
    statusDot.className = 'dot disconnected';
    statusText.textContent = 'Not connected';
  }
  serverUrl.textContent = relayUrl || '—';

  if (remoteCount > 0) {
    remotesRow.style.display = 'flex';
    remotesText.textContent = `${remoteCount} remote${remoteCount === 1 ? '' : 's'} connected`;
  } else {
    remotesRow.style.display = 'none';
  }
}

// ─── Copy remote URL to clipboard ────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  const relay = serverUrl.textContent || 'http://localhost:3000';
  // The remote.html is served relative to the relay server root
  const remoteUrl = relay.replace(/\/$/, '') + '/remote';

  navigator.clipboard.writeText(remoteUrl).then(() => {
    copyFeedback.textContent = 'Copied!';
    setTimeout(() => { copyFeedback.textContent = ''; }, 2000);
  }).catch(() => {
    copyFeedback.textContent = 'Failed to copy';
  });
});
