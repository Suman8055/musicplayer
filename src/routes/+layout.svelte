<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import * as audioEngine from '$lib/audioEngine.js';
  import { extractAndApplyAccent } from '$lib/colorEngine.js';
  import { gateToken } from '$lib/stores/gate.js';
  import { onEnded, next, prev, setPreloadElement, isTransitioningTrack } from '$lib/playback.js';
  import { Log } from '$lib/logger.js';
  import { APP_VERSION } from '$lib/api.js';
  import { intelPrune } from '$lib/smartPlay.js';
  import { idbGetAll } from '$lib/idb.js';
  import { downloadedIds } from '$lib/stores/library.js';
  import {
    playing, userPaused, nowSong, seekProgress, currentTime, duration,
    loadingUrl, offlineBlobUrl, seeking, setAudioElement, getAudioElement
  } from '$lib/stores/playback.js';
  import { toast, isOnline, updateAvailable, elderView } from '$lib/stores/ui.js';
  import PasscodeGate from '$lib/components/gate/PasscodeGate.svelte';
  import NetworkBanner from '$lib/components/layout/NetworkBanner.svelte';
  import StagingBanner from '$lib/components/layout/StagingBanner.svelte';
  import MiniPlayer from '$lib/components/player/MiniPlayer.svelte';
  import NowPlaying from '$lib/components/player/NowPlaying.svelte';
  import EQPanel from '$lib/components/player/EQPanel.svelte';
  import QueuePanel from '$lib/components/player/QueuePanel.svelte';
  import SmartQueueBadge from '$lib/components/player/SmartQueueBadge.svelte';
  import TabBar from '$lib/components/tabs/TabBar.svelte';
  import Toast from '$lib/components/shared/Toast.svelte';
  import ActionSheet from '$lib/components/shared/ActionSheet.svelte';
  import PromptModal from '$lib/components/shared/PromptModal.svelte';
  import UpdateBanner from '$lib/components/layout/UpdateBanner.svelte';
  import '../app.css';

  // ── Audio element bindings — NEVER re-mount these ─────────────────────────
  let audioEl;
  let audioPreloadEl;

  // Derived: is gate unlocked?
  $: unlocked = $gateToken === '278b0ebf70ec6ed8b4c6480de49a1650ace8d513d277e1374801564e49186d37';

  // Track accent color updates from nowSong changes — guard by id to avoid double-fire
  // (play() updates nowSong twice: once at start, again when stream metadata arrives)
  let _lastAccentId = null;
  $: if ($nowSong?.image && $nowSong.id !== _lastAccentId) {
    _lastAccentId = $nowSong.id;
    extractAndApplyAccent($nowSong.image, $nowSong.id);
  }

  onMount(() => {
    // ── Single-instance lock (prevents double-audio when iOS opens a second PWA tab) ──
    // When a new instance loads it broadcasts TAKE_OVER; any older tab hears it and
    // immediately pauses audio. This eliminates the "double sound" bug seen in logs
    // where two App-started events appear within ~1s of each other.
    const _tabId = Math.random().toString(36).slice(2);
    let _isActiveTab = true;
    let _bc = null;
    try {
      _bc = new BroadcastChannel('mbx_tab_lock');
      _bc.onmessage = (e) => {
        if (e.data?.type === 'TAKE_OVER' && e.data.id !== _tabId) {
          // Another tab took over — this instance is now a background zombie.
          // 1. Stop any current audio immediately.
          // 2. Override audioEl.play so future play() calls in this instance silently no-op.
          //    This prevents the background instance from responding to the same user tap
          //    that the new foreground instance also receives.
          _isActiveTab = false;
          if (audioEl && !audioEl.paused) { audioEl.pause(); userPaused.set(true); }
          if (audioEl) audioEl.play = () => Promise.resolve();
        }
      };
      // Announce this instance as the new active tab
      _bc.postMessage({ type: 'TAKE_OVER', id: _tabId });
    } catch {}

    // Hand audio elements to playback store and audio engine
    setAudioElement(audioEl);
    setPreloadElement(audioPreloadEl);

    // Init logger first so all subsequent events are captured
    Log.init(APP_VERSION);
    intelPrune();

    // Init audio engine — does NOT create AudioContext yet (lazy, on first gesture)
    audioEngine.init(audioEl, {
      getState: () => ({
        playing:      $playing,
        userPaused:   $userPaused,
        nowSong:      $nowSong,
        offlineBlobUrl: $offlineBlobUrl,
      }),
      onCorsUnavailable: () => {
        toast('Enhanced audio unavailable — EQ disabled for this stream');
      },
      onLog: (level, msg, data) => {
        if (level === 'warn') { Log.warn(msg, data ?? null); console.warn('[Engine]', msg, data ?? ''); }
        else { Log.info(msg, data ?? null); console.info('[Engine]', msg, data ?? ''); }
      }
    });

    // Apply elder view if saved from previous session
    if ($elderView) document.body.classList.add('elder-view');

    // Hydrate downloaded IDs from IDB (metadata only — no blobs)
    idbGetAll().then(records => {
      downloadedIds.set(new Set(records.map(r => r.id)));
    }).catch(() => {});

    // Expose debug hook in dev
    window._mbxAudio = audioEngine.getDebugInfo;
    // Test hook: window._mbxSetAirPlay(true/false) simulates AirPlay activation without hardware
    // ── Audio element event listeners ─────────────────────────────────────────
    audioEl.addEventListener('play', () => {
      playing.set(true);
      loadingUrl.set(false);
      audioEngine.onPlaybackStarted();
    });

    audioEl.addEventListener('pause', () => {
      // Suppress spurious pause fired by browser when audio.src is reassigned during track transition
      if (isTransitioningTrack()) return;
      playing.set(false);
      audioEngine.onPlaybackPaused();
    });

    audioEl.addEventListener('playing', () => {
      loadingUrl.set(false);
    });

    audioEl.addEventListener('waiting', () => {
      loadingUrl.set(true);
    });

    audioEl.addEventListener('timeupdate', () => {
      const t = audioEl.currentTime;
      const d = audioEl.duration || 0;
      currentTime.set(t);
      duration.set(d);
      if (!$seeking && d > 0) seekProgress.set(t / d);
      if ('mediaSession' in navigator && d > 0 && isFinite(t) && isFinite(d)) {
        try {
          navigator.mediaSession.setPositionState({ duration: d, playbackRate: 1.0, position: Math.min(t, d) });
        } catch (e) {
          Log.warn('MediaSession: setPositionState failed', { err: e?.message, t, d });
        }
      }
    });

    audioEl.addEventListener('loadedmetadata', () => {
      duration.set(audioEl.duration || 0);
    });

    audioEl.addEventListener('ended', () => {
      playing.set(false);
      Log.info('Song ended naturally', {
        name:     $nowSong?.name   ?? null,
        duration: audioEl.duration ?? null,
      });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      onEnded();
    });

    audioEl.addEventListener('error', (e) => {
      loadingUrl.set(false);
      const err = audioEl.error;
      Log.error('Audio element error', {
        code:    err?.code    ?? null,
        message: err?.message ?? null,
        src:     audioEl.src ? audioEl.src.slice(0, 120) : null,
      });
    });

    // ── MediaSession action handlers (registered once, never re-registered) ──
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play',         () => { Log.info('MediaSession: play');         try { audioEl.play(); } catch {} });
      navigator.mediaSession.setActionHandler('pause',        () => { Log.info('MediaSession: pause');        try { audioEl.pause(); userPaused.set(true); audioEngine.onUserPaused(); } catch {} });
      navigator.mediaSession.setActionHandler('stop',         () => { Log.info('MediaSession: stop');         try { audioEl.pause(); userPaused.set(true); audioEngine.onUserPaused(); } catch {} });
      navigator.mediaSession.setActionHandler('nexttrack',    () => { Log.info('MediaSession: nexttrack');    try { next(); } catch (e) { Log.warn('MediaSession: nexttrack error', { error: e?.message }); } });
      navigator.mediaSession.setActionHandler('previoustrack',() => { Log.info('MediaSession: previoustrack'); try { prev(); } catch (e) { Log.warn('MediaSession: previoustrack error', { error: e?.message }); } });
      navigator.mediaSession.setActionHandler('seekto',       (d) => { Log.info('MediaSession: seekto', { seekTime: d.seekTime }); try { if (d.seekTime != null) audioEl.currentTime = d.seekTime; } catch {} });
    }

    // ── Visibility / page lifecycle ──────────────────────────────────────────
    // Collect all window/document listeners so they can be removed on destroy
    // (prevents HMR double-registration and ensures clean teardown)
    const _listeners = [];
    function _on(target, type, fn) { target.addEventListener(type, fn); _listeners.push([target, type, fn]); }

    _on(document, 'visibilitychange', () => {
      if (!_isActiveTab) return;
      if (document.hidden) {
        audioEngine.startBgKeepAlive();
        if ('mediaSession' in navigator && $playing && !$userPaused)
          navigator.mediaSession.playbackState = 'playing';
        return;
      }
      audioEngine.stopBgKeepAlive();
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      (async () => {
        if (audioEngine.getDebugInfo()?.audioCtx?.state === 'suspended') {
          try { await audioEngine.getDebugInfo().audioCtx.resume(); } catch {}
        }
        if (!$userPaused && $nowSong && audioEl.paused) {
          audioEl.play().catch(() => {});
        }
        if ('mediaSession' in navigator)
          navigator.mediaSession.playbackState = (!$userPaused && $nowSong) ? 'playing' : 'paused';
      })();
    });

    _on(window, 'pageshow', (e) => {
      if (!_isActiveTab || !e.persisted) return;
      (async () => {
        const info = audioEngine.getDebugInfo();
        if (info?.audioCtx?.state === 'suspended') { try { await info.audioCtx.resume(); } catch {} }
        if (!$userPaused && $nowSong && audioEl.paused) audioEl.play().catch(() => {});
      })();
    });

    _on(window, 'pagehide', () => {
      if ($playing && !$userPaused && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing';
      const blobUrl = $offlineBlobUrl;
      if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch {} offlineBlobUrl.set(null); }
    });

    _on(document, 'freeze', () => {
      if ($playing && !$userPaused && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing';
    });

    _on(document, 'resume', () => {
      if (!_isActiveTab) return;
      (async () => {
        const info = audioEngine.getDebugInfo();
        if (info?.audioCtx?.state === 'suspended') { try { await info.audioCtx.resume(); } catch {} }
        if (!$userPaused && $nowSong && audioEl.paused) audioEl.play().catch(() => {});
      })();
    });

    // ── Network status ────────────────────────────────────────────────────────
    isOnline.set(navigator.onLine);
    _on(window, 'online',  () => isOnline.set(true));
    _on(window, 'offline', () => isOnline.set(false));

    // ── SW update ─────────────────────────────────────────────────────────────
    _on(window, 'sw-update-ready', e => {
      const { waiting, newVersion } = e.detail;
      const _parseVer = s => { const m = s?.match(/v(\d+)\.(\d+)\.(\d+)/); return m ? [+m[1],+m[2],+m[3]] : [0,0,0]; };
      const [nm,ni,np] = _parseVer(newVersion);
      const [cm,ci,cp] = _parseVer(APP_VERSION);
      const isNewer = nm > cm || (nm===cm && ni > ci) || (nm===cm && ni===ci && np > cp);
      if (newVersion && isNewer) updateAvailable.set({ waiting, newVersion });
    });

    if ('audioSession' in navigator) navigator.audioSession.type = 'playback';

    return () => {
      try { _bc?.close(); } catch {}
      _listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    };
  });
</script>

<!-- CRITICAL: These two audio elements must NEVER be re-mounted.
     They live here in the root layout and nowhere else. -->
<audio
  id="audio"
  bind:this={audioEl}
  preload="metadata"
  playsinline
  webkit-playsinline
></audio>
<audio
  id="audio-preload"
  bind:this={audioPreloadEl}
  preload="metadata"
  playsinline
  webkit-playsinline
  style="visibility:hidden;position:absolute;width:0;height:0;pointer-events:none"
></audio>

<NetworkBanner />
<StagingBanner />

{#if unlocked}
  <div id="app">
    <div id="content">
      <slot />
    </div>
    <SmartQueueBadge />
    <MiniPlayer />
    <TabBar />
  </div>
  <NowPlaying />
  <EQPanel />
  <QueuePanel />
  <UpdateBanner />
  <Toast />
  <ActionSheet />
  <PromptModal />
{:else}
  <PasscodeGate />
{/if}
