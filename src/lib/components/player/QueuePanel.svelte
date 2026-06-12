<script>
  import { queue, qIdx, nowSong } from '$lib/stores/playback.js';
  import { queueOpen } from '$lib/stores/ui.js';
  import { play } from '$lib/playback.js';
  import { bestImg } from '$lib/utils.js';

  function playAt(idx) {
    const q = $queue;
    if (q[idx]) play(q[idx], q, idx);
  }

  function close() { queueOpen.set(false); }
</script>

<div id="queue-panel" class:open={$queueOpen}>
  <div class="queue-hdr">
    <button class="back-btn" on:click={close}>✕</button>
    <div class="queue-title">Up Next</div>
    <div style="width:32px"></div>
  </div>

  {#if !$queue.length}
    <div class="empty-wrap">Queue is empty</div>
  {:else}
    <div class="queue-list">
      {#each $queue as song, i (song.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="queue-row" class:playing={i === $qIdx} on:click={() => playAt(i)}>
          <img class="q-art" src={bestImg(song.image, '80x80')} alt="" loading="lazy" />
          <div class="q-info">
            <div class="q-name" class:accent={i === $qIdx}>{song.name}</div>
            <div class="q-artist">{song.artist}</div>
          </div>
          {#if i === $qIdx}
            <div class="eq-bars">
              <span></span><span></span><span></span>
            </div>
          {:else}
            <div class="q-num">{i + 1}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  #queue-panel {
    position: fixed; inset: 0; z-index: 85;
    background: var(--bg); overflow-y: auto;
    transform: translateY(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #queue-panel.open { transform: translateY(0); }
  .queue-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 12px;
    padding-top: calc(16px + env(safe-area-inset-top));
    position: sticky; top: 0; background: var(--bg); z-index: 1;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .back-btn { font-size: 18px; color: var(--fg3); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
  .queue-title { font-size: 16px; font-weight: 700; }
  .queue-list { padding-bottom: calc(100px + env(safe-area-inset-bottom)); }
  .queue-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; cursor: pointer;
    transition: background .15s;
  }
  .queue-row:active { background: rgba(255,255,255,.05); }
  .queue-row.playing { background: hsla(var(--accent-h),var(--accent-s),var(--accent-l),.08); }
  .q-art { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
  .q-info { flex: 1; min-width: 0; }
  .q-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .q-name.accent { color: var(--accent); }
  .q-artist { font-size: 12px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .q-num { font-size: 12px; color: var(--fg3); min-width: 20px; text-align: right; flex-shrink: 0; }
  .empty-wrap { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--fg3); font-size: 14px; }

  .eq-bars { display: flex; align-items: flex-end; gap: 2px; height: 16px; flex-shrink: 0; }
  .eq-bars span {
    width: 3px; background: var(--accent); border-radius: 2px;
    animation: eq-bounce 0.6s ease-in-out infinite alternate;
  }
  .eq-bars span:nth-child(1) { height: 8px; animation-delay: 0s; }
  .eq-bars span:nth-child(2) { height: 14px; animation-delay: 0.2s; }
  .eq-bars span:nth-child(3) { height: 6px; animation-delay: 0.4s; }
  @keyframes eq-bounce {
    from { transform: scaleY(0.4); }
    to   { transform: scaleY(1); }
  }
</style>
