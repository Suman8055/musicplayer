<script>
  import { nowSong, playing, loadingUrl, seekProgress } from '$lib/stores/playback.js';
  import { npOpen } from '$lib/stores/ui.js';
  import { togglePlay, prev, next } from '$lib/playback.js';
  import { fmt } from '$lib/utils.js';
</script>

{#if $nowSong}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div id="mini" on:click={() => npOpen.set(true)}>
    <div id="mini-bg" style="background-image:url({$nowSong.image || ''})"></div>
    <div id="mini-inner">
      <img id="mini-art" src={$nowSong.image || ''} alt={$nowSong.name || ''} />
      <div id="mini-info">
        <div id="mini-title">{$nowSong.name || '—'}</div>
        <div id="mini-artist">{$nowSong.artist || '—'}</div>
      </div>
      <div id="mini-btns">
        <button class="mini-btn" id="mini-prev" on:click|stopPropagation={prev}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button class="mini-btn" id="mini-play" on:click|stopPropagation={togglePlay}>
          {#if $loadingUrl}
            <div class="spinner" style="width:22px;height:22px;border-width:2px"></div>
          {:else if $playing}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          {:else}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
        <button class="mini-btn" id="mini-next" on:click|stopPropagation={next}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4-5.5-4zm7-6h2v12h-2z"/></svg>
        </button>
      </div>
    </div>
    <div id="mini-bar" style="width:{($seekProgress * 100).toFixed(1)}%"></div>
  </div>
{/if}

<style>
  #mini {
    position: fixed;
    bottom: var(--tab-h);
    left: 0; right: 0;
    height: var(--mini-h);
    z-index: 35;
    cursor: pointer;
    overflow: hidden;
  }
  #mini-bg {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
    filter: blur(40px) brightness(.4) saturate(1.5);
    transform: scale(1.2);
  }
  #mini-inner {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 10px;
    height: 100%; padding: 0 12px;
  }
  #mini-art {
    width: 42px; height: 42px; border-radius: 6px;
    object-fit: cover; flex-shrink: 0;
  }
  #mini-info { flex: 1; min-width: 0; }
  #mini-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #mini-artist { font-size: 12px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #mini-btns { display: flex; align-items: center; gap: 4px; }
  .mini-btn { color: var(--fg); padding: 6px; border-radius: 50%; }
  .mini-btn:active { background: rgba(255,255,255,.1); }
  #mini-bar {
    position: absolute; bottom: 0; left: 0; height: 2px;
    background: var(--accent); transition: width .3s linear;
    max-width: 100%;
  }
</style>
