# Apple Music Remote

Control Apple Music on your computer from any phone, tablet, or other device — no app install required.

A Chrome extension hooks into [music.apple.com](https://music.apple.com) and connects to a lightweight relay server. Any device that opens the remote page can instantly play, pause, skip, scrub, and control volume.

```
[Chrome on your computer]          [Relay Server]          [Any device]
 Extension (MV3)           <-->    Node.js + ws   <-->     remote.html
 Hooks into MusicKit JS            Forwards messages        Play / Pause / Skip
```

---

## Features

- Play, pause, skip forward/back
- Scrub through the song (click or drag the progress bar)
- Volume control
- Album artwork, track title, artist, and album display
- Live progress bar with timestamps
- Works across any devices on the same network, or globally with a deployed server
- No app install — remote UI runs entirely in the browser

---

## Project Structure

```
├── extension/          Chrome MV3 extension
│   ├── manifest.json
│   ├── background.js   Service worker — manages WebSocket connection
│   ├── content.js      Injected into music.apple.com
│   ├── injected.js     Accesses MusicKit JS in page scope
│   ├── popup.html/js   Extension popup (connection status)
├── server/             Node.js relay server
│   ├── server.js
│   ├── package.json
│   └── .env
└── remote/
    └── remote.html     Self-contained mobile remote UI
```

---

## Setup

### 1. Start the relay server

```bash
cd server
npm install
node server.js
# Running at http://localhost:3000
```

### 2. Load the Chrome extension

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the `extension/` folder

### 3. Open the remote

Open `http://localhost:3000/remote` on any device on the same network.

### 4. Play something

Open [music.apple.com](https://music.apple.com) in Chrome and start playing. The remote will populate automatically.

---

## Deploying for cross-network access

Deploy `server/` to [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io) (all have free tiers).

Then update the WebSocket URL in `extension/background.js`:
```js
const RELAY_WS_URL = 'wss://your-app.onrender.com';
```
Reload the extension and share `https://your-app.onrender.com/remote` with any device.

---

## How it works

Chrome content scripts run in an isolated context and can't access `window.MusicKit` directly. The extension injects a script (`injected.js`) into the real page scope, which hooks into the MusicKit JS API to send state updates and execute playback commands. These are relayed to connected remote devices via a WebSocket server.

---

## Known limitations

- Requires an active Apple Music subscription and the user to be signed in
- Apple can update `music.apple.com` at any time and break MusicKit JS hooks
- MV3 service workers can go idle — a `chrome.alarms` keep-alive ping is used to prevent this
