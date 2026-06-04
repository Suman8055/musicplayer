<script>
  import { sheetOpen, sheetData, closeSheet } from '$lib/stores/ui.js';
</script>

{#if $sheetOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div id="sheet-wrap" on:click={closeSheet}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div id="sheet" on:click|stopPropagation>
      <div class="sheet-title">{$sheetData.title}</div>
      <div id="sheet-body">
        {#each $sheetData.actions as action}
          <button class="sheet-action" class:danger={action.danger} on:click={() => { action.action(); closeSheet(); }}>
            {action.label}
          </button>
        {/each}
        <button class="sheet-cancel" on:click={closeSheet}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  #sheet-wrap {
    position: fixed; inset: 0; z-index: 150;
    background: rgba(0,0,0,.5);
    display: flex; align-items: flex-end;
    animation: fade-in .18s ease;
  }
  #sheet {
    width: 100%; background: var(--bg2);
    border-radius: var(--radius2) var(--radius2) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: slide-up .22s cubic-bezier(.32,.72,0,1);
  }
  .sheet-title {
    font-size: 13px; color: var(--fg3); text-align: center;
    padding: 14px 16px 10px; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .sheet-action {
    display: block; width: 100%; padding: 16px;
    font-size: 16px; color: var(--fg); text-align: left;
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .sheet-action.danger { color: #ef4444; }
  .sheet-cancel {
    display: block; width: 100%; padding: 16px;
    font-size: 16px; color: var(--fg3); text-align: center;
  }
  @keyframes fade-in { from { opacity: 0 } }
  @keyframes slide-up { from { transform: translateY(100%) } }
</style>
