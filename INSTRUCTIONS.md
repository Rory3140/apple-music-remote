# Apple Music Remote — Project Instructions

## Project Overview
A Chrome extension that hooks into music.apple.com and allows a remote device (phone, tablet, another computer) to control Apple Music playback via a relay server.

---

## Architecture

```
[Computer running Chrome]         [Cloud Relay Server]        [Remote Device]
 Chrome Extension (MV3)    <-->   Node.js + Socket.io   <-->  remote.html page
 Injects into music.apple.com     Forwards commands           Play/Pause/Next/Prev
 Controls MusicKit JS             between devices             Shows now-playing info
```

---

## File Structure

```
apple-music-remote/
├── INSTRUCTIONS.md          ← This file (update as you go)
├── GOTCHAS.md               ← Document issues and fixes as discovered
├── TESTING.md               ← Step-by-step testing procedures
├── extension/
│   ├── manifest.json        ← Chrome MV3 manifest
│   ├── background.js        ← Service worker, manages WebSocket connection
│   ├── content.js           ← Injected into music.apple.com
│   ├── injected.js          ← Script injected into page scope to access MusicKit JS
│   ├── popup.html           ← Optional local extension popup UI
│   └── popup.js
├── server/
│   ├── package.json
│   ├── server.js            ← Node.js + Socket.io relay server
│   └── .env                 ← PORT and any config vars
└── remote/
    └── remote.html          ← Mobile-friendly remote control UI (self-contained)
```

---

## Key Technical Notes

### MusicKit JS Access (CRITICAL)
- Chrome content scripts run in an **isolated context** — they cannot directly access `window.MusicKit`
- Solution: inject a `<script>` tag into the actual page DOM to run code in the page's JS scope
- The injected script communicates back to the content script via `window.postMessage`
- Example pattern:
  ```js
  // In content.js — inject a script into page scope
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  document.documentElement.appendChild(script);

  // injected.js runs in page scope and can access MusicKit
  const player = MusicKit.getInstance().player;
  window.postMessage({ type: 'MUSIC_STATE', isPlaying: player.isPlaying }, '*');
  ```
- Make sure `injected.js` is listed under `web_accessible_resources` in manifest.json

### Manifest V3 Service Worker Keep-Alive
- MV3 service workers go to sleep when idle, which kills the WebSocket connection
- Use a keep-alive ping every 20 seconds to prevent this
- Alternative: use `chrome.alarms` API to periodically wake the service worker

### Socket.io Rooms
- Use two named rooms or roles: `host` (the computer running the extension) and `remote` (the controlling device)
- Server just forwards messages between the two roles
- This makes it easy to support multiple remote devices simultaneously

### Now Playing Data to Send Back
- Song title
- Artist name
- Album name
- Album artwork URL
- isPlaying (boolean)
- Current time / duration (for a progress bar)

---

## Setup & Installation

### 1. Install Server Dependencies
```bash
cd server
npm install
```

### 2. Run the Relay Server Locally (for testing)
```bash
cd server
node server.js
# Server runs on http://localhost:3000 by default
```

### 3. Load the Chrome Extension
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The extension should appear in your extensions list

### 4. Test Locally
1. Make sure the relay server is running
2. Open `music.apple.com` in Chrome and sign in to Apple Music
3. Open `remote/remote.html` in another tab or device browser
4. Try play/pause/next/previous buttons on the remote page

### 5. Deploy Server (for cross-device use)
- Deploy `server/` to Render, Railway, or Fly.io (all have free tiers)
- Update the WebSocket URL in `extension/background.js` and `remote/remote.html` to point to your deployed server URL
- Redeploy or reload the extension after updating the URL

---

## Testing Checklist

Refer to `TESTING.md` for full step-by-step test procedures. High level:

- [ ] Extension loads in Chrome without errors
- [ ] Extension connects to relay server (check background.js console)
- [ ] music.apple.com loads without issues after extension is installed
- [ ] MusicKit JS is accessible via injected.js (no console errors)
- [ ] Play command from remote page starts music
- [ ] Pause command stops music
- [ ] Next/Previous skips tracks correctly
- [ ] Now-playing info (song, artist, artwork) appears on remote page
- [ ] Works across two different devices on the same network
- [ ] Works across two different devices on different networks (requires deployed server)

---

## Known Issues & Gotchas

> Update this section as issues are discovered. See also GOTCHAS.md for detailed fixes.

- MusicKit JS may not be available immediately on page load — wait for the `musickitloaded` event before trying to call `MusicKit.getInstance()`
- Apple Music requires the user to be signed in — extension will not work on the login screen
- Service worker may go to sleep — implement keep-alive ping
- Apple can update music.apple.com at any time and break MusicKit JS hooks — monitor for breakage after Apple updates

---

## Cowork Session Log

> Update this section at the end of each Cowork session with what was accomplished and what to do next.

### Session 1 — 2026-02-26
- [x] Full project scaffolded from scratch
- [x] `extension/manifest.json` — MV3, alarms permission, content script on music.apple.com, web_accessible_resources for injected.js
- [x] `extension/background.js` — Socket.io service worker, keep-alive via `chrome.alarms`, host role registration, command forwarding
- [x] `extension/content.js` — Injects injected.js, bridges postMessage ↔ chrome.runtime.sendMessage
- [x] `extension/injected.js` — Page-scope MusicKit JS access, play/pause/next/prev/seek/volume, state push via postMessage
- [x] `extension/popup.html` + `popup.js` — Connection status UI, copy remote URL button
- [x] `server/server.js` — Express + Socket.io relay, host/remote rooms, last-state caching for new remotes, /health endpoint, serves remote.html at /remote
- [x] `server/package.json` + `.env`
- [x] `remote/remote.html` — Mobile-friendly single-file UI: artwork, track info, progress bar, play/pause/next/prev, seek, volume slider, no-host overlay
- [x] `GOTCHAS.md` — 8 documented gotchas with fixes
- [x] `TESTING.md` — Full step-by-step test procedure and checklist
- **Next session:** Install server deps (`cd server && npm install`), load the extension in Chrome, and run through TESTING.md Part 1–4. Also consider bundling socket.io.min.js locally inside the extension to remove the CDN dependency.

### Session 2
- [ ] Notes:

---

## Future Improvements
- Volume control slider on remote page
- Queue management (view upcoming songs)
- Search and queue a song from remote page
- Monetization: freemium model with Stripe for premium features
- Android app wrapper around remote.html (using WebView)
- Consider publishing to Chrome Web Store

---

*Last updated: Session 1 — 2026-02-26*
