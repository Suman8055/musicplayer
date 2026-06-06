// playback.js — Core playback controller. Extracted from index.html play/next/prev/togglePlay.
// Reads/writes Svelte stores. Calls audioEngine via direct import.
// CRITICAL: play() preserves iOS gesture chain — ensureAudioCtx() and resumeAudioCtx()
// are called synchronously, with audio.src and audio.play() immediately after.
import { get } from 'svelte/store';
import * as audioEngine from './audioEngine.js';
import { apiStream } from './api.js';
import { idbGet } from './idb.js';
import { cacheSong } from './utils.js';
import { Log } from './logger.js';
import {
  nowSong, queue, qIdx, playing, userPaused, seekProgress,
  loadingUrl, offlineBlobUrl, shuffleOn, shuffledQueue, shufflePos,
  repeatMode, getAudioElement
} from './stores/playback.js';
import { toast, npOpen } from './stores/ui.js';
import { smartInjectAhead, smartQueueFill, intelTrackPlay, _artistKey } from './smartPlay.js';

// Per-session state (not stores — concurrency flags, not reactive UI)
let _pendingNext      = false;
let _intelNaturalEnd  = false;
let _intelPlayStartTs = 0;
let _sessionSkipStreak = 0;
let _sessionSuppressed = new Set();
const _suppressedAt   = new Map();
let _prevFullPlayArtistKey = null;
let _queueWritePending = false;

export function createShuffledQueue() {
  const q = get(queue);
  const idx = get(qIdx);
  const arr = q.map((_, i) => i).filter(i => i !== idx);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  shuffledQueue.set([idx, ...arr]);
  shufflePos.set(0);
}

export async function play(song, newQueue, idx) {
  const audio = getAudioElement();
  if (!audio) return;
  const isLoading = get(loadingUrl);
  const current   = get(nowSong);
  if (isLoading && current?.id === song.id) return; // block double-tap on same song

  if (newQueue !== undefined) {
    queue.set(newQueue);
    qIdx.set(idx);
    if (get(shuffleOn)) createShuffledQueue();
  }
  nowSong.set(song);
  cacheSong(song);
  npOpen.set(true);
  loadingUrl.set(true);

  try {
    // ── Offline blob path ────────────────────────────────────────────────────
    const offline = await idbGet(song.id);
    if (offline?.blob) {
      if (get(nowSong)?.id !== song.id) return;
      const blobUrl = URL.createObjectURL(offline.blob);
      const prev = get(offlineBlobUrl);
      if (prev) { try { URL.revokeObjectURL(prev); } catch {} }
      offlineBlobUrl.set(blobUrl);

      // iOS gesture chain — NOTHING between resumeAudioCtx() and audio.play()
      // resumeAudioCtx is fire-and-forget: awaiting it yields to the event loop,
      // which terminates iOS Safari's user-gesture transient activation → NotAllowedError.
      audio.crossOrigin = null;
      audioEngine.ensureAudioCtx();
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      audioEngine.resumeAudioCtx().catch(() => {});
      audio.src = blobUrl;
      await audio.play().catch(e => Log.warn('Offline play failed', { err: e.message }));

      if (get(nowSong)?.id !== song.id) return;
      playing.set(true);
      userPaused.set(false);
      Log.info('Playback (offline)', { name: song.name });
      setTimeout(() => { if (get(nowSong)?.id === song.id) audioEngine.measureAndApplyLufs(song); }, 3000);

    } else {
      // ── Network stream path ──────────────────────────────────────────────
      // Fetch URL first — async work done BEFORE touching audio element
      const stream = await apiStream(song.id);
      if (get(nowSong)?.id !== song.id) return;

      // Update metadata from stream response
      if (stream.image || stream.quality) {
        nowSong.update(s => ({ ...s, image: stream.image || s.image, quality: stream.quality || s.quality }));
      }

      // iOS gesture chain — NOTHING between resumeAudioCtx() and audio.play()
      // resumeAudioCtx is fire-and-forget: awaiting it yields to the event loop,
      // which terminates iOS Safari's user-gesture transient activation → NotAllowedError.
      audio.crossOrigin = 'anonymous';
      audioEngine.ensureAudioCtx();
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      audioEngine.resumeAudioCtx().catch(() => {});
      const prev = get(offlineBlobUrl);
      if (prev) { try { URL.revokeObjectURL(prev); } catch {} offlineBlobUrl.set(null); }
      audio.src = stream.url;
      await audio.play().catch(e => Log.warn('Play failed', { err: e.message }));

      if (get(nowSong)?.id !== song.id) return;
      playing.set(true);
      userPaused.set(false);
      _intelPlayStartTs = Date.now();
      Log.info('Playback started', { name: song.name, artist: song.artist });
      setTimeout(() => { if (get(nowSong)?.id === song.id) audioEngine.measureAndApplyLufs(song); }, 3000);
    }

    setTimeout(() => preloadNext(audio), 1500);
    _updateMediaSession(song);
  } catch (e) {
    toast('Stream unavailable — try another song');
    playing.set(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    Log.error('Playback failed', { name: song.name, err: e.message });
  } finally {
    loadingUrl.set(false);
    if (_pendingNext) { _pendingNext = false; next(); }
  }
}

export async function togglePlay() {
  const audio = getAudioElement();
  if (!audio || !get(nowSong) || get(loadingUrl)) return;
  if (get(playing)) {
    userPaused.set(true);
    audioEngine.onUserPaused();
    audio.pause();
  } else {
    userPaused.set(false);
    audioEngine.resumeAudioCtx().catch(() => {});
    if (audio.ended) audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

export function prev() {
  const audio = getAudioElement();
  if (!audio || get(loadingUrl)) return;
  const curTime = audio.currentTime;
  if (curTime > 3) { audio.currentTime = 0; return; }
  const totDur = audio.duration;
  const song = get(nowSong);
  if (song && totDur > 0) intelTrackPlay(song, curTime / totDur);
  if (get(shuffleOn)) {
    const pos = get(shufflePos);
    if (pos > 0) {
      shufflePos.set(pos - 1);
      const sq = get(shuffledQueue);
      qIdx.set(sq[pos - 1]);
      play(get(queue)[sq[pos - 1]]);
    }
    return;
  }
  const idx = get(qIdx);
  if (idx > 0) { qIdx.set(idx - 1); play(get(queue)[idx - 1]); }
}

export function next() {
  const audio = getAudioElement();
  const song  = get(nowSong);
  if (song) {
    const curTime = audio?.currentTime || 0;
    const totDur  = audio?.duration   || 0;
    const ratio   = _intelNaturalEnd ? 1.0 : (totDur > 0 ? curTime / totDur : 0);
    const isFast  = !_intelNaturalEnd && _intelPlayStartTs > 0 && (Date.now() - _intelPlayStartTs) < 5000;
    intelTrackPlay(song, ratio, isFast);
    if (_intelNaturalEnd || ratio >= 0.8) { _sessionSkipStreak = 0; smartInjectAhead(); }
    else if (isFast) {
      _sessionSkipStreak++;
      if (_sessionSkipStreak >= 2) {
        const key = _artistKey(song);
        if (key) { _sessionSuppressed.add(key); _suppressedAt.set(key, Date.now()); }
        _sessionSkipStreak = 0;
      }
    } else { _sessionSkipStreak = 0; }
  }
  _intelNaturalEnd = false;

  if (get(loadingUrl)) { _pendingNext = true; return; }

  const rm = get(repeatMode);
  if (rm === 2) {
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
    return;
  }

  let ni;
  if (get(shuffleOn)) {
    const pos = get(shufflePos);
    const sq  = get(shuffledQueue);
    const nextPos = pos + 1;
    if (nextPos >= sq.length) {
      if (rm === 1) { createShuffledQueue(); ni = get(shuffledQueue)[0]; }
      else { smartQueueFill().then(filled => { if (!filled) playing.set(false); }); return; }
    } else {
      shufflePos.set(nextPos);
      ni = sq[nextPos];
    }
  } else {
    const idx = get(qIdx);
    ni = idx + 1;
    if (ni >= get(queue).length) {
      if (rm === 1) ni = 0;
      else { smartQueueFill().then(filled => { if (!filled) playing.set(false); }); return; }
    }
  }
  qIdx.set(ni);
  play(get(queue)[ni]);
}

// Called from audio 'ended' event in layout
export function onEnded() {
  _intelNaturalEnd = true;
  next();
}

export function seek(ratio) {
  const audio = getAudioElement();
  if (audio && audio.duration) audio.currentTime = ratio * audio.duration;
}

export function setVolume(v) {
  audioEngine.setVolume(v);
}

async function preloadNext(audio) {
  const q   = get(queue);
  if (!q.length) return;
  let nextIdx;
  if (get(shuffleOn)) {
    const pos = get(shufflePos), sq = get(shuffledQueue);
    if (pos >= sq.length - 1) return;
    nextIdx = sq[pos + 1];
  } else {
    const idx = get(qIdx);
    if (idx >= q.length - 1) return;
    nextIdx = idx + 1;
  }
  const nextSong = q[nextIdx];
  if (!nextSong) return;
  try {
    const result = await apiStream(nextSong.id);
    const audioPreload = document.getElementById('audio-preload');
    if (audioPreload && audioPreload.src !== result.url) {
      audioPreload.src = result.url;
      audioPreload.load();
    }
  } catch {}
}

// Fetch artwork and encode as a data: URL (512×512 JPEG).
// Raw CDN URLs are rejected by Tesla/Bluetooth AVRCP firmware (403 outside browser).
// data: URLs embed the bytes directly — the OS passes them over AVRCP without HTTP.
async function _fetchArtDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const SIZE = 512;
        const cv = document.createElement('canvas');
        cv.width = SIZE; cv.height = SIZE;
        cv.getContext('2d').drawImage(img, 0, 0, SIZE, SIZE);
        URL.revokeObjectURL(objUrl);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
      img.src = objUrl;
    });
  } catch { return null; }
}

let _msAbortCtrl = null;

async function _updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !song) return;

  // Cancel any in-flight artwork fetch from a previous song
  if (_msAbortCtrl) { _msAbortCtrl.abort(); _msAbortCtrl = null; }

  // Set title/artist/album immediately so lock screen shows something right away
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  song.name   || 'Unknown',
      artist: song.artist || '',
      album:  song.album  || '',
      artwork: [],
    });
    navigator.mediaSession.playbackState = 'playing';
  } catch {}

  if (!song.image) return;

  // Snapshot song id — if the song changes while fetching, discard the result
  const songId = song.id;
  _msAbortCtrl = new AbortController();
  const imgUrl = song.image.replace(/\d+x\d+/, '500x500');
  const dataUrl = await _fetchArtDataUrl(imgUrl);
  _msAbortCtrl = null;

  // Bail if song changed during the async fetch
  if (!dataUrl || get(nowSong)?.id !== songId) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  song.name   || 'Unknown',
      artist: song.artist || '',
      album:  song.album  || '',
      artwork: [{ src: dataUrl, sizes: '512x512', type: 'image/jpeg' }],
    });
  } catch {}
}
