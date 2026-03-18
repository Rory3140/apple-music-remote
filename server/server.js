// server.js - Apple Music Remote relay server
// Routes state from the Chrome extension host to connected remotes, and commands back the other way.

require('dotenv').config();

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const PORT      = process.env.PORT || 3000;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Suggestions cache ──────
// keyed by "title|artist" so we don't call the API for the same track twice
const suggestionsCache = new Map();

// ─── Express ──────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/remote', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../remote/remote.html'));
});
app.get('/remote/', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../remote/remote.html'));
});

app.use('/assets', express.static(path.resolve(__dirname, '../assets')));

// Cloud Run uses this to confirm the container is healthy
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    hosts: [...clients.values()].filter(c => c.role === 'host').length,
    remotes: [...clients.values()].filter(c => c.role === 'remote').length,
  });
});

// ─── AI Suggestions ──────
// takes the current track + queue, asks Claude for 4 song suggestions
app.post('/api/suggestions', async (req, res) => {
  const { title, artist, album, queue } = req.body;

  if (!title && !artist) return res.json({ suggestions: [] });

  const cacheKey = `${title}|${artist}`;
  if (suggestionsCache.has(cacheKey)) {
    return res.json({ suggestions: suggestionsCache.get(cacheKey) });
  }

  try {
    const queueList = Array.isArray(queue) && queue.length > 0
      ? `\nAlready queued: ${queue.slice(0, 5).map(q => `"${q.title}" by ${q.artist}`).join(', ')}.`
      : '';

    const message = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 256,
      messages: [{
        role:    'user',
        content: `The user is listening to "${title}" by ${artist}${album ? ` from "${album}"` : ''}.${queueList} Suggest 4 songs they might enjoy next — avoid anything already queued. Reply with ONLY a JSON array, no other text: [{"title":"...","artist":"..."}]`,
      }],
    });

    const suggestions = JSON.parse(message.content[0].text.trim());

    // cache and cap size so memory doesn't grow forever
    suggestionsCache.set(cacheKey, suggestions);
    if (suggestionsCache.size > 200) {
      suggestionsCache.delete(suggestionsCache.keys().next().value);
    }

    res.json({ suggestions });
  } catch (err) {
    console.error('[suggestions] Error:', err.message);
    res.status(500).json({ suggestions: [] });
  }
});

// ─── Server setup ──────
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });

// tracks every connected socket and its role (host | remote | null)
const clients = new Map();

// cached so new remotes get the current track immediately on connect
let lastKnownState = null;

// ─── Helpers ──────
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

function countRole(role) {
  let n = 0;
  for (const info of clients.values()) if (info.role === role) n++;
  return n;
}

// ─── WebSocket handler ──────
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

  // Cloud Run closes idle connections, so we ping every 30s to keep them alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on('close', () => clearInterval(pingInterval));
});

// ─── Start ──────
httpServer.listen(PORT, () => {
  console.log(`[server] Relay listening on port ${PORT}`);
  console.log(`[server] Remote UI: http://localhost:${PORT}/remote`);
});
