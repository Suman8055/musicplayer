<script>
  import { updateAvailable } from '$lib/stores/ui.js';
  import { playing } from '$lib/stores/playback.js';

  function applyUpdate() {
    const { waiting } = $updateAvailable;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // location.reload() fires via controllerchange listener in app.html
  }

  // Extract readable version from cache key e.g. "mbx-sk-v5.0.12-abc1234" → "v5.0.12"
  function parseVersion(cacheKey) {
    const m = cacheKey?.match(/mbx-sk-(v[\d.]+)/);
    return m ? m[1] : 'new version';
  }
</script>

{#if $updateAvailable}
  <div class="update-banner" class:playing={$playing}>
    <span class="update-label">
      ✦ {parseVersion($updateAvailable.newVersion)} available
    </span>
    {#if $playing}
      <span class="update-hint">Finish song then tap</span>
    {/if}
    <button class="update-btn" on:click={applyUpdate} disabled={$playing}>
      {$playing ? 'Update after song' : 'Update now'}
    </button>
    <button class="update-dismiss" on:click={() => updateAvailable.set(null)} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: calc(var(--tab-h) + var(--mini-h, 0px) + 8px);
    left: 12px; right: 12px;
    z-index: 50;
    background: rgba(10, 20, 40, 0.95);
    border: 1px solid rgba(99, 210, 255, 0.3);
    border-radius: 14px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 4px 24px rgba(0,0,0,.5);
    animation: slide-up .3s cubic-bezier(.32,.72,0,1);
  }
  @keyframes slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .update-label {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: rgb(99, 210, 255);
  }
  .update-hint {
    font-size: 11px;
    color: rgba(255,255,255,.4);
    white-space: nowrap;
  }
  .update-btn {
    background: rgb(99, 210, 255);
    color: #000;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 12px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
  }
  .update-btn:disabled {
    background: rgba(99, 210, 255, 0.3);
    color: rgba(255,255,255,.5);
    cursor: default;
  }
  .update-dismiss {
    background: none;
    border: none;
    color: rgba(255,255,255,.35);
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
    flex-shrink: 0;
    font-family: inherit;
  }
</style>
