<script>
  import { nowSong, playing, loadingUrl, seekProgress, currentTime, duration, seeking, shuffleOn, repeatMode, userPaused, getAudioElement } from '$lib/stores/playback.js';
  import { npOpen, eqSheetOpen, airPlayDspWarn, showSheet, toast } from '$lib/stores/ui.js';
  import { whyChip, smartPlayOn } from '$lib/stores/smartplay.js';
  import { liked, playlists } from '$lib/stores/library.js';
  import { togglePlay, prev, next, seek } from '$lib/playback.js';
  import { intelTrackLike } from '$lib/smartPlay.js';
  import { fmt, esc } from '$lib/utils.js';
  import { get } from 'svelte/store';

  let seekVal = 0;
  $: if (!$seeking) seekVal = Math.round($seekProgress * 1000);

  function onSeekStart()  { seeking.set(true); }
  function onSeekEnd()    { seek(seekVal / 1000); seeking.set(false); }
  function onSeekInput(e) { seekVal = +e.target.value; }

  $: elapsed  = fmt($currentTime);
  $: remain   = $duration > 0 ? '−' + fmt($duration - $currentTime) : '−0:00';

  $: isLiked = $liked.some(s => s.id === $nowSong?.id);

  function toggleLike() {
    if (!$nowSong) return;
    if (isLiked) {
      liked.update(arr => arr.filter(s => s.id !== $nowSong.id));
      toast('Removed from liked');
    } else {
      liked.update(arr => [{ ...$nowSong, likedAt: Date.now() }, ...arr]);
      intelTrackLike($nowSong);
      toast('Added to liked songs');
    }
  }

  function cycleShuffle() { shuffleOn.update(v => !v); }
  function cycleRepeat()  { repeatMode.update(v => (v + 1) % 3); }

  function onMenuBtn() {
    if (!$nowSong) return;
    showSheet($nowSong.name, [
      { label: 'Add to Playlist', action: () => {} },
      { label: isLiked ? 'Remove from Liked' : 'Add to Liked', action: toggleLike },
    ]);
  }

  const REPEAT_ICONS = [
    `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
    `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" text-anchor="middle" font-size="7" fill="currentColor" stroke="none">1</text>`,
    `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
  ];
</script>

<div id="np" class:open={$npOpen}>
  <div id="np-bg" style="background-image:url({$nowSong?.image || ''})"></div>
  <div id="np-inner">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div id="np-handle" on:click={() => npOpen.set(false)}></div>
    <div id="np-topbar">
      <button class="np-circle" id="np-close-btn" on:click={() => npOpen.set(false)}>✕</button>
      <div id="np-label">Now Playing</div>
      <button class="np-circle" id="np-menu-btn" on:click={onMenuBtn}>•••</button>
    </div>

    <div id="np-art-wrap">
      <img
        id="np-art"
        src={$nowSong?.image || ''}
        alt={$nowSong?.name || ''}
        class:playing={$playing}
        class:paused-anim={!$playing && $nowSong}
      />
      {#if $loadingUrl}
        <div id="np-loading" class="show">
          <div class="spinner" style="border-color:rgba(255,255,255,.25);border-top-color:#fff;width:40px;height:40px;border-width:4px"></div>
        </div>
      {/if}
    </div>

    <div id="np-info">
      <div id="np-texts">
        <div id="np-song">{$nowSong?.name || '—'}</div>
        <div id="np-artist">{$nowSong?.artist || '—'}</div>
        {#if $nowSong?.quality}
          <div id="np-quality" class="visible">{$nowSong.quality}</div>
        {/if}
        {#if $airPlayDspWarn}
          <div id="np-airplay-dsp-warn">EQ unavailable on AirPlay</div>
        {/if}
      </div>
      <button id="np-like" class:liked={isLiked} on:click={toggleLike}>
        {isLiked ? '♥' : '♡'}
      </button>
    </div>

    <div id="np-seek-wrap">
      <input
        id="np-seek"
        type="range" min="0" max="1000" step="1"
        bind:value={seekVal}
        on:mousedown={onSeekStart} on:touchstart={onSeekStart}
        on:mouseup={onSeekEnd}     on:touchend={onSeekEnd}
        on:input={onSeekInput}
      />
      <div id="np-times">
        <span id="np-elapsed">{elapsed}</span>
        <span id="np-remain">{remain}</span>
      </div>
    </div>

    <div id="np-controls">
      <button class="ctl" class:accent={$shuffleOn} class:dim={!$shuffleOn} id="np-shuffle-btn" on:click={cycleShuffle}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        </svg>
      </button>
      <button class="ctl" id="np-prev-btn" on:click={prev}>
        <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button id="np-play" on:click={togglePlay}>
        {#if $loadingUrl}
          <div class="spinner" style="width:36px;height:36px;border-width:3px;border-color:rgba(255,255,255,.2);border-top-color:#fff"></div>
        {:else if $playing}
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        {:else}
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        {/if}
      </button>
      <button class="ctl" id="np-next-btn" on:click={next}>
        <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4-5.5-4zm7-6h2v12h-2z"/></svg>
      </button>
      <button class="ctl" class:accent={$repeatMode > 0} class:dim={$repeatMode === 0} id="np-repeat-btn" on:click={cycleRepeat}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          {@html REPEAT_ICONS[$repeatMode]}
        </svg>
      </button>
    </div>

    {#if $whyChip}
      <div id="np-why-chip" on:click={() => {}}>{$whyChip.label}</div>
    {/if}

    <div id="np-footer">
      <button class="np-foot" id="np-add-pl-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Playlist
      </button>
      <button class="np-foot" id="np-queue-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>Queue
      </button>
      <button class="np-foot" class:active={$smartPlayOn} id="np-smartplay-btn" on:click={() => smartPlayOn.update(v => !v)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-1 14.5v-9l7 4.5-7 4.5z"/></svg>Smart
      </button>
      <button class="np-foot" id="np-eq-btn" on:click={() => eqSheetOpen.set(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <line x1="4" y1="18" x2="4" y2="6"/><line x1="9" y1="18" x2="9" y2="10"/>
          <line x1="14" y1="18" x2="14" y2="4"/><line x1="19" y1="18" x2="19" y2="12"/>
        </svg>EQ
      </button>
    </div>
  </div>
</div>

<style>
  #np {
    position: fixed; inset: 0; z-index: 80;
    transform: translateY(100%);
    transition: transform var(--np-dur) cubic-bezier(.32,.72,0,1);
    will-change: transform;
    pointer-events: none;
  }
  #np.open { transform: translateY(0); pointer-events: auto; }
  #np-bg {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
    filter: blur(60px) brightness(.25) saturate(1.8);
    transform: scale(1.15);
  }
  #np-inner {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    height: 100%; padding: 0 20px;
    padding-top: env(safe-area-inset-top);
    padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
  }
  #np-handle {
    width: 36px; height: 4px; background: rgba(255,255,255,.25);
    border-radius: 2px; margin: 10px auto 8px;
  }
  #np-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .np-circle { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; font-size: 13px; }
  #np-label { font-size: 13px; font-weight: 600; opacity: .7; }
  #np-art-wrap { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
  #np-art {
    width: min(72vw, 340px); height: min(72vw, 340px);
    border-radius: 16px; object-fit: cover;
    box-shadow: 0 20px 60px rgba(0,0,0,.6);
    transition: transform .4s ease;
  }
  #np-art.playing { transform: scale(1.04); }
  #np-art.paused-anim { transform: scale(0.96); }
  #np-loading { position: absolute; display: none; align-items: center; justify-content: center; }
  #np-loading.show { display: flex; }
  #np-info { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 8px; }
  #np-song { font-size: 20px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #np-artist { font-size: 15px; color: var(--fg3); }
  #np-quality { font-size: 10px; color: var(--accent); display: none; }
  #np-quality.visible { display: block; }
  #np-airplay-dsp-warn { font-size: 10px; color: rgba(255,180,0,.8); }
  #np-like { font-size: 22px; color: var(--fg3); padding: 4px 8px; }
  #np-like.liked { color: #ef4444; }
  #np-seek-wrap { margin: 4px 0 8px; }
  #np-seek {
    width: 100%; -webkit-appearance: none; height: 4px;
    background: rgba(255,255,255,.2); border-radius: 2px;
    padding: 12px 0; box-sizing: content-box; cursor: pointer;
  }
  #np-seek::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: #fff;
    box-shadow: 0 0 6px rgba(0,0,0,.4);
  }
  #np-times { display: flex; justify-content: space-between; font-size: 11px; color: var(--fg3); margin-top: 2px; }
  #np-controls { display: flex; align-items: center; justify-content: space-between; margin: 8px 0; }
  .ctl { color: var(--fg); padding: 4px; }
  .ctl.dim { opacity: .4; }
  .ctl.accent { color: var(--accent); opacity: 1; }
  #np-play {
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 20px hsla(var(--accent-h),var(--accent-s),var(--accent-l),.4);
  }
  #np-why-chip {
    margin: 4px 0; padding: 5px 12px; border-radius: 20px;
    background: hsla(var(--accent-h),var(--accent-s),var(--accent-l),.1);
    border: 1px solid hsla(var(--accent-h),var(--accent-s),var(--accent-l),.25);
    font-size: 11px; color: var(--fg2); text-align: center; cursor: pointer;
  }
  #np-footer { display: flex; justify-content: space-around; margin-top: 12px; }
  .np-foot {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    font-size: 10px; color: var(--fg3); padding: 4px 8px;
    transition: color .15s;
  }
  .np-foot.active { color: var(--accent); }
  .np-foot:active { opacity: .7; }
</style>
