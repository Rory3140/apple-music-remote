// popup.js - Handles the extension popup UI

const statusDot    = document.getElementById('statusDot');
const statusText   = document.getElementById('statusText');
const serverUrl    = document.getElementById('serverUrl');
const copyBtn      = document.getElementById('copyBtn');
const copyFeedback = document.getElementById('copyFeedback');
const remotesRow   = document.getElementById('remotesRow');
const remotesText  = document.getElementById('remotesText');

// ─── Get current status from background worker ──────
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    setStatus(false, '—', 0);
    return;
  }
  if (response) {
    setStatus(response.connected, response.relayUrl, response.remoteCount || 0);
  }
});

// listen for live updates while popup is open
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONNECTION_STATUS') {
    setStatus(message.connected, serverUrl.textContent, message.remoteCount || 0);
  }
});

// ─── Update UI ──────
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

// ─── Copy remote link ──────
copyBtn.addEventListener('click', () => {
  const relay = serverUrl.textContent || 'http://localhost:3000';
  // convert wss:// → https:// so the URL is openable in a browser
  const remoteUrl = relay.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/$/, '') + '/remote';

  navigator.clipboard.writeText(remoteUrl).then(() => {
    copyFeedback.textContent = 'Copied!';
    setTimeout(() => { copyFeedback.textContent = ''; }, 2000);
  }).catch(() => {
    copyFeedback.textContent = 'Failed to copy';
  });
});
