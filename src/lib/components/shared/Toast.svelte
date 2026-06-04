<script>
  import { toastMsg } from '$lib/stores/ui.js';
</script>

{#if $toastMsg}
  <div id="toast" class="show">{$toastMsg}</div>
{/if}

<style>
  #toast {
    position: fixed;
    bottom: calc(var(--tab-h) + var(--mini-h) + 12px);
    left: 50%; transform: translateX(-50%);
    background: rgba(30,40,60,.96);
    color: var(--fg); font-size: 13px; font-weight: 500;
    border-radius: 20px; padding: 8px 18px;
    white-space: nowrap; z-index: 200;
    box-shadow: 0 4px 20px rgba(0,0,0,.4);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,.08);
    animation: toast-in .2s ease;
  }
  @keyframes toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } }
</style>
