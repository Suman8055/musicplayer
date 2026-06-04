<script>
  import { nowSong, playing } from '$lib/stores/playback.js';
  import { downloadedIds } from '$lib/stores/library.js';
  import { fmt } from '$lib/utils.js';

  export let song;
  export let onPlay  = () => {};
  export let onMore  = null;
  export let showNum = null; // chart rank number

  $: isNow = $nowSong?.id === song?.id;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="song-item" class:now={isNow} on:click={onPlay}>
  {#if showNum !== null}
    <div class="song-rank" class:top3={showNum <= 3}>{showNum}</div>
  {:else}
    <div class="song-art-wrap">
      <img class="song-art" src={song.image || ''} alt="" loading="lazy" />
      {#if isNow && $playing}
        <div class="song-art-overlay">
          <div class="eq-bars active"><span></span><span></span><span></span></div>
        </div>
      {/if}
    </div>
  {/if}
  <div class="song-info">
    <div class="song-title" class:now-text={isNow}>{song.name || '—'}</div>
    <div class="song-meta">
      {song.artist || ''}
      {#if song.duration}· {fmt(song.duration)}{/if}
      {#if $downloadedIds.has(song.id)}<span class="dl-dot"></span>{/if}
    </div>
  </div>
  {#if onMore}
    <button class="song-more" on:click|stopPropagation={() => onMore(song)}>•••</button>
  {/if}
</div>

<style>
  .song-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; cursor: pointer; transition: background .1s;
  }
  .song-item:active { background: rgba(255,255,255,.05); }
  .song-art-wrap { position: relative; flex-shrink: 0; width: 44px; height: 44px; }
  .song-art { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; }
  .song-art-overlay {
    position: absolute; inset: 0; border-radius: 6px;
    background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center;
  }
  .song-rank { width: 28px; text-align: center; font-size: 13px; color: var(--fg3); flex-shrink: 0; }
  .song-rank.top3 { color: var(--accent); font-weight: 700; }
  .song-info { flex: 1; min-width: 0; }
  .song-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .song-title.now-text { color: var(--accent); }
  .song-meta { font-size: 12px; color: var(--fg3); display: flex; align-items: center; gap: 4px; }
  .dl-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
  .song-more { color: var(--fg3); padding: 8px; font-size: 16px; letter-spacing: .05em; }
</style>
