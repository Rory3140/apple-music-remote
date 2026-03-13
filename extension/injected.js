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
    // Try immediately — may already be configured
    try { init(); } catch (_) {}
  }
  // Always listen for the event in case it fires later
  document.addEventListener('musickitloaded', () => {
    try { init(); } catch (_) {}
  });

  // ─── Attach MusicKit event listeners ────────────────────────────────────────
  function attachListeners() {
    const evts = [
      MusicKit.Events.playbackStateDidChange,
      MusicKit.Events.nowPlayingItemDidChange,
      MusicKit.Events.playbackProgressDidChange, // correct v3 event name for time updates
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

    // nowPlayingItem — may be null when nothing is queued
    const item = musicKit.nowPlayingItem;
    if (item) {
      title  = item.title       || item.attributes?.name        || '';
      artist = item.artistName  || item.attributes?.artistName  || '';
      album  = item.albumName   || item.attributes?.albumName   || '';
      artwork = getArtworkUrl(item);
    }

    // Playback time — directly on musicKit in v3
    try { currentTime = musicKit.currentPlaybackTime     || 0; } catch (_) {}
    try { duration    = musicKit.currentPlaybackDuration || 0; } catch (_) {}

    const state = {
      type: 'MUSIC_STATE',
      isPlaying: !!musicKit.isPlaying,
      currentTime,
      duration,
      title,
      artist,
      album,
      artwork,
    };

    window.postMessage(state, '*');
  }

  // ─── Artwork URL helper ──────────────────────────────────────────────────────
  function getArtworkUrl(item) {
    const SIZE = 300;
    try {
      // MusicKit.formatArtworkURL is the v3 helper
      return MusicKit.formatArtworkURL(item.artwork, SIZE, SIZE);
    } catch (_) {}

    // Fallback: artwork object with a url template (common in v3)
    try {
      const art = item.artwork || item.attributes?.artwork;
      if (art && art.url) {
        return art.url
          .replace('{w}', SIZE)
          .replace('{h}', SIZE)
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

    const { type, seekTime, volume } = event.data;

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
          if (typeof seekTime === 'number') {
            await musicKit.seekToTime(seekTime);
          }
          break;
        case 'SET_VOLUME':
          if (typeof volume === 'number') {
            // Volume lives on musicKit directly in v3
            musicKit.volume = Math.max(0, Math.min(1, volume));
          }
          break;
        default:
          return; // ignore unknown types
      }
    } catch (e) {
      console.error('[injected] Error handling command:', type, e);
    }

    // Always push fresh state after any command
    sendState();
  });
})();
