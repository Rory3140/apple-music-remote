# Apple Music Remote

Control Apple Music on your Mac from your phone or any other device — no app install needed on the remote end. 

Built as a Chrome extension that hooks into [music.apple.com](https://music.apple.com) and talks to a relay server deployed on Google Cloud Run. Any device that opens the remote URL can control playback instantly.

```
[Chrome on your Mac]               [Google Cloud Run]        [Remote device]
 Extension (MV3)           <-->    Node.js relay     <-->    Browser or iOS app
 Reads MusicKit JS                 Routes messages           Play / Pause / Skip / Queue
```

---

## Features

- Play, pause, skip, and scrub through tracks
- Shuffle and repeat controls
- Volume slider
- Album artwork, title, artist, and album display
- Live progress bar with timestamps
- Up Next queue view (next 20 tracks) — tap any track to jump to it
- AI-powered song suggestions based on the current track and album art, verified against Apple Music and clickable to play
- Multiple remotes can connect at once
- Native iOS app (SwiftUI) as an alternative to the browser remote
- Server deployed on Google Cloud Run — no local server needed

---

## Project Structure

```
├── extension/          Chrome MV3 extension
│   ├── manifest.json
│   ├── background.js   Service worker — manages WebSocket connection to relay
│   ├── content.js      Injected into music.apple.com, bridges page and worker
│   ├── injected.js     Runs in page scope, reads and controls MusicKit JS
│   └── popup.html/js   Extension popup showing connection status
├── server/             Node.js relay server
│   ├── server.js
│   └── package.json
├── remote/
│   └── remote.html     Self-contained browser remote UI
├── ios/                Native SwiftUI iOS app
│   └── AppleMusicRemote/
└── assets/             Icons
```

---

## Setup

### 1. Load the Chrome extension

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the `extension/` folder

### 2. Open the remote

The relay server is already deployed — just open the remote URL on any device:

```
https://apple-music-remote-802824893434.us-central1.run.app/remote
```

Or click **Copy Remote Link** from the extension popup.

### 3. Play something

Open [music.apple.com](https://music.apple.com) in Chrome and start playing. The remote will update automatically.

---

## Running the server locally

If you want to run the relay yourself:

```bash
cd server
npm install
node server.js
# http://localhost:3000
```

Then update `RELAY_WS_URL` in `extension/background.js` to point at your local server and reload the extension.

---

## iOS App

An alternative to the browser remote. Open the Xcode project in `ios/` and run it on a simulator or device. It connects to the same relay server and has the same controls plus a native sheet for the queue and suggestions.

---

## How it works

Chrome content scripts run in an isolated context and can't access `window.MusicKit` directly. The extension injects a script into the actual page scope which reads playback state and executes commands through the MusicKit JS API. State is pushed up to the relay server every 2 seconds and on any playback event, then broadcast to all connected remotes. Commands from remotes travel back the other way.

When a track changes, the server calls the Claude API with the current track, album art, and queue context to generate song suggestions. Each suggestion is verified against the iTunes Search API before being shown, and clicking one queues it up and plays it immediately.

---

## Known limitations

- Requires an active Apple Music subscription
- Apple can update music.apple.com at any time and break the MusicKit JS hooks
- MV3 service workers go idle after ~30s — a `chrome.alarms` keep-alive prevents this
