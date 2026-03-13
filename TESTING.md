# Apple Music Remote — Testing Procedures

> Step-by-step test procedures. Run through these after any significant change.

---

## Prerequisites

- Node.js 18+ installed
- A Chromium-based browser (Chrome, Edge, Brave)
- An active Apple Music subscription
- Two devices on the same network (or a deployed server for cross-network tests)

---

## Part 1 — Relay Server

### 1.1 Install Dependencies
```bash
cd server
npm install
```

### 1.2 Start the Server
```bash
node server.js
```
**Expected:** Console prints:
```
[server] Apple Music Remote relay listening on port 3000
[server] Remote UI available at http://localhost:3000/remote
```

### 1.3 Health Check
Open `http://localhost:3000/health` in a browser.

**Expected:** JSON response `{ "status": "ok", "uptime": <number> }`

### 1.4 Remote UI Loads
Open `http://localhost:3000/remote` in a browser.

**Expected:** Remote control page loads, showing "No host connected" overlay and "Connecting…" status.

---

## Part 2 — Chrome Extension

### 2.1 Load the Extension
1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Extension appears in list with no errors

**Expected:** No errors in the extension card. The Apple Music Remote icon appears in the toolbar.

### 2.2 Check Background Service Worker
1. On the extensions page, click **Service worker** link under the extension
2. This opens the service worker DevTools

**Expected:** Console shows:
```
[background] Connecting to relay: http://localhost:3000
[background] Connected to relay server, socket id: <id>
```

### 2.3 Popup Status
Click the extension icon in the toolbar.

**Expected:** Popup shows green dot "Connected to relay server" and the relay URL.

---

## Part 3 — MusicKit JS Integration

### 3.1 Open Apple Music
Navigate to `https://music.apple.com` and sign in.

### 3.2 Check Content Script Loaded
Open DevTools on the music.apple.com tab → Console. Filter by "injected".

**Expected:** `[injected] MusicKit instance acquired.` message after the page finishes loading.

### 3.3 Play a Track
Start playing any song in Apple Music.

**Expected:** The remote page (`http://localhost:3000/remote`) updates with:
- Album artwork
- Track title and artist
- Progress bar moving
- Play/pause button showing "pause" icon

---

## Part 4 — Remote Commands

### 4.1 Play / Pause
On the remote page, tap the play/pause button.

**Expected:** Music pauses/resumes on the computer. Remote UI icon toggles.

### 4.2 Next Track
Tap the next (▶|) button.

**Expected:** Apple Music skips to the next track. Remote updates with new track info.

### 4.3 Previous Track
Tap the previous (|◀) button.

**Expected:** Apple Music goes back to the previous track.

### 4.4 Seek
Tap anywhere on the progress bar.

**Expected:** Music jumps to that position. Progress bar reflects the new time.

### 4.5 Volume
Move the volume slider.

**Expected:** Volume changes on Apple Music.

---

## Part 5 — Keep-Alive

### 5.1 Idle Test
1. Leave Apple Music open and connected
2. Wait 5 minutes without sending any commands
3. Try play/pause from the remote

**Expected:** Commands still work after 5 minutes of idle time. The service worker is kept alive by the alarm.

---

## Part 6 — Cross-Device (Requires Deployed Server)

### 6.1 Deploy the Server
Deploy `server/` to Render, Railway, or Fly.io.

### 6.2 Update Extension & Remote
- In `extension/background.js`, change `RELAY_URL` to your deployed URL
- Reload the extension (`chrome://extensions` → refresh button)

### 6.3 Open Remote on Another Device
Open `https://your-deployed-url/remote` on a phone or tablet (different network OK).

**Expected:** Remote connects, shows current track, and controls work.

---

## Checklist Summary

- [ ] Server starts and health check passes
- [ ] Remote UI loads at `/remote`
- [ ] Extension loads without errors
- [ ] Background service worker connects to relay
- [ ] Popup shows "Connected"
- [ ] MusicKit JS accessible — no console errors on music.apple.com
- [ ] Now-playing info appears on remote page
- [ ] Play / Pause works from remote
- [ ] Next track works from remote
- [ ] Previous track works from remote
- [ ] Seek (progress bar) works from remote
- [ ] Volume slider works from remote
- [ ] Extension stays connected after 5 minutes idle
- [ ] Works cross-device on the same network
- [ ] Works cross-device on different networks (deployed server)
