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
  import { toast, airPlayDspWarn, airPlayAvailable, airPlayActive, isOnline, updateAvailable, elderView } from '$lib/stores/ui.js';
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
        airPlayActive.set(active);
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
    // createMediaElementSource() installs an MTAudioProcessingTap on AVFoundation which
    // permanently sets allowsExternalPlayback=NO on audioEl's AVPlayer — making
    // webkitCurrentPlaybackTargetIsWireless always return false on audioEl.
    // The probe element avoids this, but in practice the webkit event is unreliable
    // (it only fires if the element was playing before AirPlay was activated).
    // Primary detection: W3C Remote Playback API state changes on the probe element.
    // Fallback: webkit property poll on probe. Belt-and-suspenders: both run together.

    airPlayProbeEl.volume = 0;

    // Mirror src to probe so it loads the same stream (needed for Remote Playback API
    // and for webkitCurrentPlaybackTargetIsWireless to have an active AVPlayer).
    // crossOrigin must match the main audio element's mode per-song.
    audioEl.addEventListener('play', () => {
      if (!airPlayProbeEl || !airPlayProbeEl.src) return;
      airPlayProbeEl.currentTime = audioEl.currentTime;
      airPlayProbeEl.play().catch(() => {});
    });
    audioEl.addEventListener('pause', () => { if (airPlayProbeEl) airPlayProbeEl.pause(); });
    audioEl.addEventListener('seeked', () => { if (airPlayProbeEl) airPlayProbeEl.currentTime = audioEl.currentTime; });
    audioEl.addEventListener('emptied', () => { if (airPlayProbeEl) airPlayProbeEl.load(); });

    let _airPlayPollState = false;
    let _connectingTimer  = null; // guards against 'connecting' false-positive (picker opened, no device selected)

    function _onAirPlayActive(active, source) {
      if (_airPlayPollState === active) return;
      _airPlayPollState = active;
      airPlayActive.set(active);
      audioEngine.setAirPlayMode(active);
      Log.info('AirPlay route changed', { active, source,
        remoteState: airPlayProbeEl?.remote?.state ?? 'n/a',
        probeWireless: airPlayProbeEl?.webkitCurrentPlaybackTargetIsWireless ?? 'n/a'
      });
    }

    function _onConnecting() {
      // 'connecting' fires when iOS probes nearby devices (picker opened) — do NOT
      // treat this as active yet.  Only activate on 'connect'.  Cancel any stale timer.
      clearTimeout(_connectingTimer);
      Log.info('AirPlay connecting (waiting for connect)', {});
    }

    function _onConnect(source) {
      clearTimeout(_connectingTimer);
      _connectingTimer = null;
      _onAirPlayActive(true, source);
    }

    function _onDisconnect(source) {
      clearTimeout(_connectingTimer);
      _connectingTimer = null;
      _onAirPlayActive(false, source);
    }

    // ── Primary: W3C Remote Playback API events on probe ─────────────────────
    if (airPlayProbeEl.remote) {
      airPlayProbeEl.remote.addEventListener('connecting', () => _onConnecting());
      airPlayProbeEl.remote.addEventListener('connect',    () => _onConnect('remote-connect'));
      airPlayProbeEl.remote.addEventListener('disconnect', () => _onDisconnect('remote-disconnect'));
    }
    // audioEl.remote events also fire reliably despite the MTAudioProcessingTap
    if (audioEl.remote) {
      audioEl.remote.addEventListener('connecting', () => _onConnecting());
      audioEl.remote.addEventListener('connect',    () => _onConnect('audio-remote-connect'));
      audioEl.remote.addEventListener('disconnect', () => _onDisconnect('audio-remote-disconnect'));
    }

    // ── Secondary: webkit wireless target changed event on probe ──────────────
    airPlayProbeEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      const active = airPlayProbeEl.webkitCurrentPlaybackTargetIsWireless === true;
      _onAirPlayActive(active, 'webkit-event');
    });

    // ── Device availability (for show/hide button) ────────────────────────────
    airPlayProbeEl.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
      const avail = e.availability === 'available';
      airPlayAvailable.set(avail);
      Log.info('AirPlay availability changed', { available: avail });
    });
    if (airPlayProbeEl.remote) {
      airPlayProbeEl.remote.watchAvailability((avail) => {
        airPlayAvailable.set(avail);
      }).catch(() => { airPlayAvailable.set(true); });
    }

    Log.info('AirPlay initial state', {
      supported: 'webkitCurrentPlaybackTargetIsWireless' in airPlayProbeEl,
      remoteSupported: !!airPlayProbeEl.remote,
      probeReady: !!airPlayProbeEl
    });

    // ── Tertiary: property poll — only fires on confirmed connected state ──────
    const _airPlayPollInterval = setInterval(() => {
      try {
        const fromProbe  = airPlayProbeEl?.webkitCurrentPlaybackTargetIsWireless === true;
        const fromRemote = airPlayProbeEl?.remote?.state === 'connected'; // 'connecting' excluded
        const current = fromProbe || fromRemote;
        if (current !== _airPlayPollState) _onAirPlayActive(current, 'poll');
      } catch (err) {
        Log.warn('AirPlay poll error', { error: err?.message });
      }
    }, 1000);

    // External AirPlay pause guard — hardware remote/HomePod tap pauses audioEl
    // without firing the MediaSession 'pause' action, so userPaused stays false.
    audioEl.addEventListener('pause', () => {
      if ($userPaused) return;
      if (_airPlayPollState) {
        userPaused.set(true);
        audioEngine.onUserPaused();
        Log.info('AirPlay external pause — userPaused set');
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
<!-- AirPlay probe: never connected to Web Audio graph so webkitCurrentPlaybackTargetIsWireless works.
     MUST have preload="metadata" (not "none") so Safari creates an AVPlayer backing object.
     MUST call .play() in sync with main audioEl so it has an active AVPlayer with a currentItem.
     volume=0 ensures it is silent locally; AirPlay output is separate and intentional. -->
<audio
  id="audio-airplay-probe"
  bind:this={airPlayProbeEl}
  preload="metadata"
  playsinline
  webkit-playsinline
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
