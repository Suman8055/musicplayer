<script>
  import { isOnline } from '$lib/stores/ui.js';
  import { onMount } from 'svelte';

  // D22: update --env-banner-h so #content padding shifts down when offline banner shows
  $: {
    const h = !$isOnline ? '34px' : '0px';
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--env-banner-h', h);
    }
  }
</script>

{#if !$isOnline}
  <div id="net-banner" role="status" aria-live="polite">No internet connection — showing offline content</div>
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
