<script>
  import { isOnline } from '$lib/stores/ui.js';
</script>

{#if !$isOnline}
  <div id="net-banner">No internet connection — showing offline content</div>
{/if}

<style>
  #net-banner {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9998;
    background: #ef4444;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    padding: 6px 16px;
    padding-top: calc(6px + env(safe-area-inset-top));
  }
</style>
