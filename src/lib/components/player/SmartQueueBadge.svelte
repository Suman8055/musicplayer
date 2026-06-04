<script>
  import { smartQueueActive } from '$lib/stores/smartplay.js';
</script>

{#if $smartQueueActive}
  <div id="sq-badge">
    <span class="sq-pulse-dot"></span>
    Smart Queue
  </div>
{/if}

<style>
  #sq-badge {
    position: fixed;
    bottom: calc(var(--tab-h) + var(--mini-h) + 8px);
    left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px;
    background: rgba(0,0,0,.7); border: 1px solid rgba(255,255,255,.15);
    border-radius: 20px; padding: 4px 12px;
    font-size: 11px; font-weight: 600; color: var(--accent);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    z-index: 34; white-space: nowrap; pointer-events: none;
  }
  .sq-pulse-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
</style>
