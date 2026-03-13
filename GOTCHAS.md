# Apple Music Remote — Gotchas & Fixes

> Document issues and solutions here as they are discovered during development and testing.

---

## 1. MusicKit JS Not Available on Page Load

**Symptom:** `MusicKit.getInstance()` throws "MusicKit has not been configured" or `window.MusicKit` is undefined.

**Cause:** MusicKit JS is loaded asynchronously by music.apple.com. Calling `getInstance()` before it's ready will fail.

**Fix:** Listen for the `musickitloaded` custom DOM event before calling `MusicKit.getInstance()`. Also check if `window.MusicKit` already exists (the event may have fired before your script ran).

```js
document.addEventListener('musickitloaded', () => {
  const musicKit = MusicKit.getInstance();
});
// Also try immediately in case already loaded:
if (window.MusicKit) { /* ... */ }
```

---

## 2. Content Scripts Can't Access `window.MusicKit`

**Symptom:** `window.MusicKit` is `undefined` inside `content.js`.

**Cause:** Chrome MV3 content scripts run in an isolated JavaScript context. They share the DOM but not the page's JS globals.

**Fix:** Inject a `<script>` tag into the real page DOM. The injected script runs in page scope and can access `MusicKit`. Communicate back to the content script using `window.postMessage`.

See `injected.js` for the implementation.

Also make sure `injected.js` is listed in `web_accessible_resources` in `manifest.json`, otherwise Chrome will refuse to load it.

---

## 3. MV3 Service Worker Goes to Sleep

**Symptom:** After a few seconds of inactivity, the background service worker terminates, killing the WebSocket connection. Commands from the remote stop working.

**Cause:** MV3 service workers are ephemeral by design — Chrome terminates them when idle.

**Fix (implemented):** Use `chrome.alarms` to wake the service worker every ~24 seconds and ping the socket. This is more reliable than `setInterval` because alarms survive service worker sleep cycles.

```js
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => socket.emit('ping', { role: 'host' }));
```

---

## 4. `importScripts` for Socket.io in Service Worker

**Symptom:** `io is not defined` in `background.js`.

**Cause:** ES module imports (`import`) are not reliably supported in all MV3 service worker contexts when loading from CDN. `importScripts` is the correct way to load external scripts in a service worker.

**Fix (implemented):** Use `importScripts('https://cdn.socket.io/4.7.4/socket.io.min.js')` at the top of `background.js`. The service worker must be able to make this network request on first run.

**Note:** If the extension is used offline or the CDN is blocked, this will fail. A future improvement is to bundle `socket.io.min.js` locally inside the extension.

---

## 5. Apple Music Requires User to Be Signed In

**Symptom:** MusicKit JS loads but `MusicKit.getInstance()` has no active player / throws an error.

**Cause:** The user is not signed in to Apple Music.

**Fix:** No code fix needed — just ensure the user is signed in at music.apple.com. The extension will not work on the login/upsell screen.

---

## 6. Album Artwork URL May Be a Template

**Symptom:** Artwork image is broken or blank.

**Cause:** MusicKit sometimes returns artwork URLs with `{w}x{h}` template placeholders (e.g. `…/{w}x{h}bb.jpg`) that need to be replaced with actual pixel values.

**Fix (implemented):** Use `MusicKit.formatArtworkURL(item.artwork, width, height)` which handles substitution automatically.

---

## 7. `nowPlayingItem` Is Null When No Track Is Queued

**Symptom:** Console errors accessing properties of `null` when MusicKit has no active track.

**Fix (implemented):** Guard all property accesses on `nowPlayingItem`:
```js
const item = musicKit.nowPlayingItem;
const title = item ? item.title : '';
```

---

## 8. Apple Can Update music.apple.com and Break MusicKit Hooks

**Symptom:** Extension stops working after an Apple update to music.apple.com.

**Cause:** Apple controls the page and can rename, restructure, or remove MusicKit APIs at any time.

**Fix:** Monitor the extension after Apple releases updates. Check `MusicKit.Events` names and `player` API. The most fragile parts are `player.currentPlaybackTime`, `player.currentPlaybackDuration`, and the artwork URL format.

---

---

## 9. Chrome Extension CSP Blocks CDN Scripts in Service Workers (Session 1)

**Symptom:** Extension errors page shows:
- "Service worker registration failed. Status code: 15"
- "Loading the script 'https://cdn.socket.io/...' violates Content Security Policy directive: script-src 'self'"
- "Failed to load socket.io: [object DOMException]"
- "Uncaught ReferenceError: io is not defined"

**Cause:** Chrome MV3 extension service workers enforce a strict Content Security Policy that only allows scripts from `'self'` (i.e., files bundled inside the extension). `importScripts` from an external CDN URL is blocked, regardless of what you put in the manifest.

**Fix:** Removed socket.io entirely. Replaced with the browser's built-in `WebSocket` API in `background.js` and `remote.html`, and replaced `socket.io` with the lightweight `ws` package on the server. No external scripts are needed.

---

## 10. `/remote/` (Trailing Slash) Returns "Cannot GET /remote/" (Session 1)

**Symptom:** Opening `http://localhost:3000/remote/` in a browser shows "Cannot GET /remote/".

**Cause:** `express.static` with a prefix maps `/remote` to the directory but serves `index.html` for the trailing-slash variant — the file is named `remote.html`, not `index.html`.

**Fix:** Replaced `express.static` with two explicit `app.get` routes, one for `/remote` and one for `/remote/`, both serving `remote.html` directly via `res.sendFile`.

---

---

## 11. JS Object Spread Silently Overwrites `type` Field (Session 1)

**Symptom:** Remote page connects (no overlay) but shows no track info and buttons do nothing.

**Cause:** JavaScript object spread with duplicate keys — the last occurrence wins silently, no error thrown.

Two separate instances:

**State:** `send({ type: 'state', ...message })` where `message.type === 'MUSIC_STATE'` → the spread overwrites `'state'` with `'MUSIC_STATE'`. Server receives `{ type: 'MUSIC_STATE', ... }` — no switch case matches it, nothing forwarded to remotes.

**Command:** `send({ type: 'command', ...{ type, ...extra } })` where `type = 'TOGGLE_PLAY'` → the spread overwrites `'command'` with `'TOGGLE_PLAY'`. Server receives `{ type: 'TOGGLE_PLAY', ... }` — switch case `'command'` never fires.

**Fix:** Strip inner `type` before spreading for state, and use a separate `action` field for commands:
```js
// State — strip the MUSIC_STATE type first:
const { type: _ignored, ...payload } = message;
send({ type: 'state', ...payload });

// Command — use 'action' not 'type' for the command name:
send({ type: 'command', action: 'TOGGLE_PLAY' });
// background.js then unpacks: forwardToContentScript({ type: action, ...rest })
```

---

---

## 12. MusicKit v3 Playback Properties Are on the Instance, Not `.player` (Session 1)

**Symptom:** Play/pause/skip work from the remote, but track title, artist, album art, and progress bar are blank/zeroed. No console errors visible because `sendState()` has a broad `try/catch` that silently swallows the error.

**Cause:** The original code used a separate `player` variable: `player = musicKit.player`. In MusicKit JS v3 for the web, `musicKit.player` returns `undefined` (or an object without the expected properties). Accessing `player.currentPlaybackTime` then throws a TypeError, which is silently caught, and `window.postMessage` is never called — so no state ever reaches the remote.

Commands worked because they called `musicKit.play()`, `musicKit.pause()` etc. directly on the `musicKit` instance, bypassing `player` entirely.

**Properties that moved to the instance directly in v3:**
- `musicKit.currentPlaybackTime` (was `player.currentPlaybackTime`)
- `musicKit.currentPlaybackDuration` (was `player.currentPlaybackDuration`)
- `musicKit.seekToTime(t)` (was `player.seekToTime(t)`)
- `musicKit.volume` (was `player.volume`)

**Also fixed:** `MusicKit.Events.playbackTimeDidChange` → `MusicKit.Events.playbackProgressDidChange` (correct v3 event name).

**Also fixed:** Artwork URL fallback — if `MusicKit.formatArtworkURL` throws, fall back to manually replacing `{w}`, `{h}`, `{f}` in `item.artwork.url`.

---

*Add new gotchas here as they are discovered.*
