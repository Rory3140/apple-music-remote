// background.js — MV3 Service Worker
// Uses the browser's built-in WebSocket API (no external libraries needed).
// Manages connection to the relay server and bridges messages between
// the content script and remote devices.

// ─── Configuration ───────────────────────────────────────────────────────────
// Change this to your deployed server URL when you deploy.
// Use ws:// for http servers, wss:// for https servers.
const RELAY_WS_URL = 'wss://apple-music-remote-802824893434.us-central1.run.app';

// ─── State ───────────────────────────────────────────────────────────────────
let ws = null;
let isConnected = false;
let reconnectTimer = null;
let remoteCount = 0;

// ─── Keep-Alive (prevent service worker from sleeping) ───────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }); // every ~24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Ping the server to keep both the WS connection and service worker alive
    if (ws && isConnected) {
      send({ type: 'ping' });
    } else if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
    }
  }
});

// ─── Connect to Relay Server ─────────────────────────────────────────────────
function connect() {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    ws.close();
    ws = null;
  }

  clearTimeout(reconnectTimer);
  console.log('[background] Connecting to relay:', RELAY_WS_URL);

  try {
    ws = new WebSocket(RELAY_WS_URL);
  } catch (e) {
    console.error('[background] WebSocket constructor failed:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    isConnected = true;
    console.log('[background] Connected to relay server');
    send({ type: 'register', role: 'host' });
    broadcastStatus();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'command') {
        const { type: _envelope, action, ...rest } = data;
        console.log('[background] Received command:', action, rest);
        forwardToContentScript({ type: action, ...rest });
      }
      if (data.type === 'headcount') {
        remoteCount = data.remotes || 0;
        broadcastStatus();
      }
      // 'pong' messages are silently ignored
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
    console.warn('[background] Disconnected (code:', event.code, ')');
    broadcastStatus();
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 3000);
}

// ─── Send helper ─────────────────────────────────────────────────────────────
function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Forward command to Content Script ───────────────────────────────────────
async function forwardToContentScript(data) {
  const tabId = await getAppleMusicTabId();
  if (!tabId) {
    console.warn('[background] No Apple Music tab found');
    return;
  }
  chrome.tabs.sendMessage(tabId, data).catch(() => {});
}

async function getAppleMusicTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://music.apple.com/*' }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0].id : null);
    });
  });
}

// ─── Messages from Content Script ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MUSIC_STATE') {
    // Strip 'MUSIC_STATE' type before sending — otherwise it overwrites 'state'
    const { type: _ignored, ...payload } = message;
    send({ type: 'state', ...payload });
    sendResponse({ ok: true });
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected, relayUrl: RELAY_WS_URL, remoteCount });
  }

  return true;
});

// ─── Broadcast Connection Status to Popup ────────────────────────────────────
function broadcastStatus() {
  chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', connected: isConnected, remoteCount })
    .catch(() => {}); // Popup may not be open
}

// ─── Init ─────────────────────────────────────────────────────────────────────
connect();
