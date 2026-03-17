// background.js - MV3 service worker
// Connects to the relay server as host and bridges messages to/from the Apple Music tab.

const RELAY_WS_URL = 'wss://apple-music-remote-802824893434.us-central1.run.app';

let ws = null;
let isConnected = false;
let reconnectTimer = null;
let remoteCount = 0;

// ─── Keep-alive ──────
// MV3 service workers die after ~30s of inactivity, alarm keeps it and the WS alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    if (ws && isConnected) {
      send({ type: 'ping' });
    } else if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
    }
  }
});

// ─── Connect ──────
function connect() {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    ws.close();
    ws = null;
  }

  clearTimeout(reconnectTimer);

  try {
    ws = new WebSocket(RELAY_WS_URL);
  } catch (e) {
    console.error('[background] WebSocket constructor failed:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    isConnected = true;
    send({ type: 'register', role: 'host' });
    broadcastStatus();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'command') {
        const { type: _envelope, action, ...rest } = data;
        forwardToContentScript({ type: action, ...rest });
      }
      if (data.type === 'headcount') {
        remoteCount = data.remotes || 0;
        broadcastStatus();
      }
    } catch (e) {
      console.warn('[background] Could not parse message:', event.data);
    }
  };

  ws.onerror = (err) => {
    console.error('[background] WebSocket error:', err);
  };

  ws.onclose = (event) => {
    isConnected = false;
    ws = null;
    broadcastStatus();
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 3000);
}

// ─── Helpers ──────
function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

async function forwardToContentScript(data) {
  const tabId = await getAppleMusicTabId();
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, data).catch(() => {});
}

async function getAppleMusicTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://music.apple.com/*' }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0].id : null);
    });
  });
}

// ─── Messages from content script ──────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MUSIC_STATE') {
    // strip the MUSIC_STATE wrapper before forwarding as a 'state' message
    const { type: _ignored, ...payload } = message;
    send({ type: 'state', ...payload });
    sendResponse({ ok: true });
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected, relayUrl: RELAY_WS_URL, remoteCount });
  }

  return true;
});

function broadcastStatus() {
  // popup may not be open, so we swallow the error
  chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', connected: isConnected, remoteCount })
    .catch(() => {});
}

connect();
