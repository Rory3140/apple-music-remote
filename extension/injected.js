// injected.js — Runs in the actual page scope (not isolated context)
// Has direct access to window.MusicKit. Communicates with content.js
// via window.postMessage.
//
// NOTE: In MusicKit JS v3 for the web, playback properties (currentPlaybackTime,
// currentPlaybackDuration, volume, seekToTime) live directly on the MusicKit
// instance — NOT on a separate `.player` sub-object.

(function () {
  'use strict';

  let musicKit = null;
  let stateInterval = null;

  // ─── Initialise once MusicKit is ready ──────────────────────────────────────
  function init() {
    try {
      musicKit = MusicKit.getInstance();
    } catch (e) {
      console.warn('[injected] MusicKit not ready:', e.message);
      return;
    }

    console.log('[injected] MusicKit instance acquired.');
    sendState();
    attachListeners();

    // Push time updates every 2 seconds for the progress bar
    if (stateInterval) clearInterval(stateInterval);
    stateInterval = setInterval(sendState, 2000);
  }

  // ─── Wait for MusicKit to be available ──────────────────────────────────────
  if (window.MusicKit) {
    try { init(); } catch (_) {}
  }
  document.addEventListener('musickitloaded', () => {
    try { init(); } catch (_) {}
  });

  // ─── Attach MusicKit event listeners ────────────────────────────────────────
  function attachListeners() {
    const evts = [
      MusicKit.Events.playbackStateDidChange,
      MusicKit.Events.nowPlayingItemDidChange,
      MusicKit.Events.playbackProgressDidChange,
    ];
    evts.forEach((evt) => {
      try { musicKit.addEventListener(evt, sendState); } catch (_) {}
    });
  }

  // ─── Build and send state ────────────────────────────────────────────────────
  function sendState() {
    if (!musicKit) return;

    let title = '', artist = '', album = '', artwork = '';
    let currentTime = 0, duration = 0;

    const item = musicKit.nowPlayingItem;
    if (item) {
      title  = item.title       || item.attributes?.name        || '';
      artist = item.artistName  || item.attributes?.artistName  || '';
      album  = item.albumName   || item.attributes?.albumName   || '';
      artwork = getArtworkUrl(item);
    }

    try { currentTime = musicKit.currentPlaybackTime     || 0; } catch (_) {}
    try { duration    = musicKit.currentPlaybackDuration || 0; } catch (_) {}

    // Repeat: 0 = none, 1 = one, 2 = all
    let repeatMode = 0;
    try { repeatMode = musicKit.repeatMode ?? 0; } catch (_) {}

    // Shuffle: 0 = off, 1 = on
    let shuffleMode = 0;
    try { shuffleMode = musicKit.shuffleMode ?? 0; } catch (_) {}

    // Queue: upcoming items after current position (max 20)
    let queue = [];
    try {
      const items = musicKit.queue?.items || [];
      const pos = typeof musicKit.queue?.position === 'number' ? musicKit.queue.position : -1;
      for (let i = pos + 1; i < Math.min(items.length, pos + 21); i++) {
        const it = items[i];
        if (!it) continue;
        queue.push({
          title:   it.title      || it.attributes?.name       || '',
          artist:  it.artistName || it.attributes?.artistName || '',
          artwork: getArtworkUrl(it),
        });
      }
    } catch (_) {}

    window.postMessage({
      type: 'MUSIC_STATE',
      isPlaying: !!musicKit.isPlaying,
      currentTime,
      duration,
      title,
      artist,
      album,
      artwork,
      repeatMode,
      shuffleMode,
      queue,
    }, '*');
  }

  // ─── Artwork URL helper ──────────────────────────────────────────────────────
  function getArtworkUrl(item, size = 300) {
    try {
      return MusicKit.formatArtworkURL(item.artwork, size, size);
    } catch (_) {}

    try {
      const art = item.artwork || item.attributes?.artwork;
      if (art && art.url) {
        return art.url
          .replace('{w}', size)
          .replace('{h}', size)
          .replace('{f}', 'jpg');
      }
    } catch (_) {}

    return '';
  }

  // ─── Handle commands from content.js ────────────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;
    if (!musicKit) return;

    const { type, seekTime, volume, repeatMode, shuffleMode } = event.data;

    try {
      switch (type) {
        case 'PLAY':
          await musicKit.play();
          break;
        case 'PAUSE':
          await musicKit.pause();
          break;
        case 'TOGGLE_PLAY':
          musicKit.isPlaying ? await musicKit.pause() : await musicKit.play();
          break;
        case 'NEXT':
          await musicKit.skipToNextItem();
          break;
        case 'PREV':
          await musicKit.skipToPreviousItem();
          break;
        case 'SEEK':
          if (typeof seekTime === 'number') await musicKit.seekToTime(seekTime);
          break;
        case 'SET_VOLUME':
          if (typeof volume === 'number') musicKit.volume = Math.max(0, Math.min(1, volume));
          break;
        case 'SET_REPEAT':
          if (typeof repeatMode === 'number') musicKit.repeatMode = repeatMode;
          break;
        case 'SET_SHUFFLE':
          if (typeof shuffleMode === 'number') musicKit.shuffleMode = shuffleMode;
          break;
        default:
          return;
      }
    } catch (e) {
      console.error('[injected] Error handling command:', type, e);
    }

    sendState();
  });
})();
