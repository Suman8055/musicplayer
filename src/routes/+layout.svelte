<script>
  import { onMount } from 'svelte';
  import * as audioEngine from '$lib/audioEngine.js';
  import { extractAndApplyAccent } from '$lib/colorEngine.js';
  import { gateToken } from '$lib/stores/gate.js';
  import { onEnded, next, prev } from '$lib/playback.js';
  import { Log } from '$lib/logger.js';
  import { APP_VERSION } from '$lib/api.js';
  import { intelPrune } from '$lib/smartPlay.js';
  import { idbGetAll } from '$lib/idb.js';
  import { downloadedIds } from '$lib/stores/library.js';
  import {
    playing, userPaused, nowSong, seekProgress, currentTime, duration,
    loadingUrl, offlineBlobUrl, seeking, setAudioElement, getAudioElement, setAirPlayProbeElement
  } from '$lib/stores/playback.js';
  import { toast, airPlayDspWarn, isOnline, updateAvailable, elderView } from '$lib/stores/ui.js';
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
  let airPlayProbeEl; // never passed to Web Audio — keeps webkitCurrentPlaybackTargetIsWireless working

  // Derived: is gate unlocked?
  $: unlocked = $gateToken === '278b0ebf70ec6ed8b4c6480de49a1650ace8d513d277e1374801564e49186d37';

  // Track accent color updates from nowSong changes
  $: if ($nowSong?.image) extractAndApplyAccent($nowSong.image, $nowSong.id);

  onMount(() => {
    // Hand audio elements to playback store and audio engine
    setAudioElement(audioEl);
    setAirPlayProbeElement(airPlayProbeEl);

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
      onAirPlayModeChange: (active) => {
        airPlayDspWarn.set(active);
      },
      onLog: (level, msg, data) => {
        if (level === 'warn') { Log.warn(msg, data ?? null); console.warn('[Engine]', msg, data ?? ''); }
        else { Log.info(msg, data ?? null); console.info('[Engine]', msg, data ?? ''); }
      }
    });

    // Apply elder view if saved from previous session
    if ($elderView) document.body.classList.add('elder-view');

    // Smart update — only notify when SW version is genuinely newer than current
    window.addEventListener('sw-update-ready', e => {
      const { waiting, newVersion } = e.detail;
      // Compare semantic versions extracted from cache keys (e.g. mbx-sk-v5.2.7-abc1234)
      const _parseVer = s => { const m = s?.match(/v(\d+)\.(\d+)\.(\d+)/); return m ? [+m[1],+m[2],+m[3]] : [0,0,0]; };
      const [nm,ni,np] = _parseVer(newVersion);
      const [cm,ci,cp] = _parseVer(APP_VERSION);
      const isNewer = nm > cm || (nm===cm && ni > ci) || (nm===cm && ni===ci && np > cp);
      if (newVersion && isNewer) {
        updateAvailable.set({ waiting, newVersion });
      }
    });

    // Hydrate downloaded IDs from IDB (metadata only — no blobs)
    idbGetAll().then(records => {
      downloadedIds.set(new Set(records.map(r => r.id)));
    }).catch(() => {});

    // Expose debug hook in dev
    window._mbxAudio = audioEngine.getDebugInfo;

    // ── Audio element event listeners ─────────────────────────────────────────
    audioEl.addEventListener('play', () => {
      playing.set(true);
      loadingUrl.set(false);
      audioEngine.onPlaybackStarted();
    });

    audioEl.addEventListener('pause', () => {
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
        } catch {}
      }
    });

    audioEl.addEventListener('loadedmetadata', () => {
      duration.set(audioEl.duration || 0);
    });

    audioEl.addEventListener('ended', () => {
      playing.set(false);
      onEnded();
    });

    audioEl.addEventListener('error', (e) => {
      loadingUrl.set(false);
      console.warn('[Audio] error', e);
    });

    // ── AirPlay detection ────────────────────────────────────────────────────
    // ROOT CAUSE: createMediaElementSource() installs an MTAudioProcessingTap on
    // AVFoundation which permanently sets allowsExternalPlayback=NO on the AVPlayer.
    // This makes webkitCurrentPlaybackTargetIsWireless always return false on audioEl.
    // FIX: use a probe <audio> element that is NEVER passed to createMediaElementSource.
    // Its webkitCurrentPlaybackTargetIsWireless works correctly.

    // Mirror src to probe so WebKit treats it as a real media element eligible for AirPlay
    audioEl.addEventListener('emptied', () => { if (airPlayProbeEl) airPlayProbeEl.load(); });

    // Probe event listener (reliable — no MTAudioProcessingTap on probe)
    airPlayProbeEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      const active = airPlayProbeEl.webkitCurrentPlaybackTargetIsWireless === true;
      audioEngine.setAirPlayMode(active);
      Log.info('AirPlay route changed (probe event)', { active });
    });

    let _airPlayPollState = false;
    Log.info('AirPlay initial state', {
      active: _airPlayPollState,
      supported: 'webkitCurrentPlaybackTargetIsWireless' in airPlayProbeEl,
      probeReady: !!airPlayProbeEl
    });

    // Poll probe element as belt-and-suspenders fallback
    const _airPlayPollInterval = setInterval(() => {
      try {
        if (!airPlayProbeEl) return;
        const current = airPlayProbeEl.webkitCurrentPlaybackTargetIsWireless === true;
        if (current !== _airPlayPollState) {
          _airPlayPollState = current;
          audioEngine.setAirPlayMode(current);
          Log.info('AirPlay route changed (probe poll)', { active: current });
        }
      } catch (err) {
        Log.warn('AirPlay poll error', { error: err?.message });
      }
    }, 1000);

    // pause→play heuristic: AirPlay route change causes a brief interruption
    let _airPlayRouteTimer = null;
    audioEl.addEventListener('pause', () => {
      if ($userPaused) return;
      _airPlayRouteTimer = setTimeout(() => { _airPlayRouteTimer = null; }, 1500);
    });
    audioEl.addEventListener('play', () => {
      if (_airPlayRouteTimer) {
        clearTimeout(_airPlayRouteTimer);
        _airPlayRouteTimer = null;
        Log.info('AirPlay route change heuristic (pause→play)', {
          probeActive: airPlayProbeEl?.webkitCurrentPlaybackTargetIsWireless
        });
      }
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
    document.addEventListener('visibilitychange', () => {
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

    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      (async () => {
        const info = audioEngine.getDebugInfo();
        if (info?.audioCtx?.state === 'suspended') { try { await info.audioCtx.resume(); } catch {} }
        if (!$userPaused && $nowSong && audioEl.paused) audioEl.play().catch(() => {});
      })();
    });

    window.addEventListener('pagehide', () => {
      if ($playing && !$userPaused && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing';
      const blobUrl = $offlineBlobUrl;
      if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch {} offlineBlobUrl.set(null); }
    });

    document.addEventListener('freeze', () => {
      if ($playing && !$userPaused && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing';
    });

    document.addEventListener('resume', () => {
      (async () => {
        const info = audioEngine.getDebugInfo();
        if (info?.audioCtx?.state === 'suspended') { try { await info.audioCtx.resume(); } catch {} }
        if (!$userPaused && $nowSong && audioEl.paused) audioEl.play().catch(() => {});
      })();
    });

    // ── Network status ────────────────────────────────────────────────────────
    isOnline.set(navigator.onLine);
    window.addEventListener('online',  () => isOnline.set(true));
    window.addEventListener('offline', () => isOnline.set(false));

    if ('audioSession' in navigator) navigator.audioSession.type = 'playback';

    return () => clearInterval(_airPlayPollInterval);
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
  x-webkit-airplay="allow"
></audio>
<audio
  id="audio-preload"
  bind:this={audioPreloadEl}
  preload="metadata"
  playsinline
  webkit-playsinline
  style="display:none"
></audio>
<!-- AirPlay probe: never connected to Web Audio graph so webkitCurrentPlaybackTargetIsWireless works -->
<audio
  id="audio-airplay-probe"
  bind:this={airPlayProbeEl}
  preload="none"
  playsinline
  x-webkit-airplay="allow"
  style="display:none"
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
