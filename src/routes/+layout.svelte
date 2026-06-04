<script>
  import { onMount } from 'svelte';
  import * as audioEngine from '$lib/audioEngine.js';
  import { extractAndApplyAccent } from '$lib/colorEngine.js';
  import { gateToken } from '$lib/stores/gate.js';
  import { onEnded } from '$lib/playback.js';
  import { Log } from '$lib/logger.js';
  import { APP_VERSION } from '$lib/api.js';
  import { intelPrune } from '$lib/smartPlay.js';
  import { idbGetAll } from '$lib/idb.js';
  import { downloadedIds } from '$lib/stores/library.js';
  import {
    playing, userPaused, nowSong, seekProgress, currentTime, duration,
    loadingUrl, offlineBlobUrl, seeking, setAudioElement, getAudioElement
  } from '$lib/stores/playback.js';
  import { toast, airPlayDspWarn, isOnline } from '$lib/stores/ui.js';
  import PasscodeGate from '$lib/components/gate/PasscodeGate.svelte';
  import NetworkBanner from '$lib/components/layout/NetworkBanner.svelte';
  import StagingBanner from '$lib/components/layout/StagingBanner.svelte';
  import MiniPlayer from '$lib/components/player/MiniPlayer.svelte';
  import NowPlaying from '$lib/components/player/NowPlaying.svelte';
  import EQPanel from '$lib/components/player/EQPanel.svelte';
  import SmartQueueBadge from '$lib/components/player/SmartQueueBadge.svelte';
  import TabBar from '$lib/components/tabs/TabBar.svelte';
  import Toast from '$lib/components/shared/Toast.svelte';
  import ActionSheet from '$lib/components/shared/ActionSheet.svelte';
  import PromptModal from '$lib/components/shared/PromptModal.svelte';
  import '../app.css';

  // ── Audio element bindings — NEVER re-mount these ─────────────────────────
  let audioEl;
  let audioPreloadEl;

  // Derived: is gate unlocked?
  $: unlocked = $gateToken === '278b0ebf70ec6ed8b4c6480de49a1650ace8d513d277e1374801564e49186d37';

  // Track accent color updates from nowSong changes
  $: if ($nowSong?.image) extractAndApplyAccent($nowSong.image, $nowSong.id);

  onMount(() => {
    // Hand audio elements to playback store and audio engine
    setAudioElement(audioEl);

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
        if (level === 'warn') console.warn('[Engine]', msg, data ?? '');
        else console.info('[Engine]', msg, data ?? '');
      }
    });

    // Init logger and prune intel
    Log.init(APP_VERSION);
    intelPrune();

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

    // ── AirPlay event listeners ──────────────────────────────────────────────
    audioEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
      audioEngine.setAirPlayMode(audioEl.webkitCurrentPlaybackTargetIsWireless === true);
    });

    audioEl.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
      // airplay button visibility — handled in NowPlaying component
    });

    // ── MediaSession action handlers (registered once, never re-registered) ──
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play',         () => { try { audioEl.play(); } catch {} });
      navigator.mediaSession.setActionHandler('pause',        () => { audioEl.pause(); userPaused.set(true); audioEngine.onUserPaused(); });
      navigator.mediaSession.setActionHandler('stop',         () => { audioEl.pause(); userPaused.set(true); audioEngine.onUserPaused(); });
      navigator.mediaSession.setActionHandler('nexttrack',    () => { /* next() from playback store — Sprint 2 */ });
      navigator.mediaSession.setActionHandler('previoustrack',() => { /* prev() from playback store — Sprint 2 */ });
      navigator.mediaSession.setActionHandler('seekto',       (d) => { if (d.seekTime != null) audioEl.currentTime = d.seekTime; });
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
  <Toast />
  <ActionSheet />
  <PromptModal />
{:else}
  <PasscodeGate />
{/if}
