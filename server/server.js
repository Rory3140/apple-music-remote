// server.js — Apple Music Remote Relay Server
// Uses the 'ws' package (plain WebSocket) — no socket.io dependency.
// Relays commands from remote devices to the Chrome extension host,
// and forwards now-playing state from the host to all remote devices.

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const path       = require('path');

const PORT = process.env.PORT || 3000;

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Serve the remote control UI at /remote (and /remote/)
app.get('/remote', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../remote/remote.html'));
});
app.get('/remote/', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../remote/remote.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    hosts: [...clients.values()].filter(c => c.role === 'host').length,
    remotes: [...clients.values()].filter(c => c.role === 'remote').length,
  });
});

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

// ─── Client Tracking ─────────────────────────────────────────────────────────
// Map<ws, { role: 'host'|'remote'|null }>
const clients = new Map();

// Last known music state — sent immediately to newly connecting remotes
let lastKnownState = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(role, data) {
  for (const [client, info] of clients) {
    if (info.role === role) sendTo(client, data);
  }
}

function broadcastHeadcount() {
  let hosts = 0, remotes = 0;
  for (const info of clients.values()) {
    if (info.role === 'host')   hosts++;
    if (info.role === 'remote') remotes++;
  }
  for (const client of clients.keys()) {
    sendTo(client, { type: 'headcount', hosts, remotes });
  }
}

// ─── Connection Handler ───────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  clients.set(ws, { role: null });
  console.log(`[server] Client connected (total: ${clients.size})`);

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    const info = clients.get(ws);

    switch (data.type) {

      case 'register': {
        const role = data.role === 'host' ? 'host' : 'remote';
        info.role = role;
        console.log(`[server] Registered as ${role} (hosts: ${countRole('host')}, remotes: ${countRole('remote')})`);

        if (role === 'host') {
          broadcast('remote', { type: 'host_connected' });
        }

        if (role === 'remote') {
          // Send cached state so new remote gets track info immediately
          if (lastKnownState) sendTo(ws, lastKnownState);
          if (countRole('host') > 0) sendTo(ws, { type: 'host_connected' });
        }

        broadcastHeadcount();
        break;
      }

      case 'state': {
        if (info.role !== 'host') return;
        lastKnownState = data;
        broadcast('remote', data);
        break;
      }

      case 'command': {
        if (info.role !== 'remote') return;
        console.log(`[server] Command from remote:`, data);
        broadcast('host', data);
        break;
      }

      case 'ping': {
        sendTo(ws, { type: 'pong' });
        break;
      }
    }
  });

  ws.on('close', (code) => {
    const info = clients.get(ws);
    const role = info ? info.role : 'unknown';
    clients.delete(ws);
    console.log(`[server] ${role} disconnected (code: ${code}, remaining: ${clients.size})`);

    if (role === 'host' && countRole('host') === 0) {
      lastKnownState = null;
      broadcast('remote', { type: 'host_disconnected' });
    }

    broadcastHeadcount();
  });

  ws.on('error', (err) => {
    console.error('[server] WebSocket error:', err.message);
  });

  // Server-side keep-alive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on('close', () => clearInterval(pingInterval));
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function countRole(role) {
  let n = 0;
  for (const info of clients.values()) if (info.role === role) n++;
  return n;
}

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[server] Apple Music Remote relay listening on port ${PORT}`);
  console.log(`[server] Remote UI: http://localhost:${PORT}/remote`);
});
