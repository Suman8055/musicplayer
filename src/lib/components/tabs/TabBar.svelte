<script>
  import { activeTab } from '$lib/stores/ui.js';
  import { nowSong, playing } from '$lib/stores/playback.js';

  const tabs = [
    { id: 'search',   label: 'Search',   icon: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>` },
    { id: 'browse',   label: 'Discover', icon: `<circle cx="12" cy="12" r="3"/><path d="M2 12h3M19 12h3M12 2v3M12 19v3"/><circle cx="12" cy="12" r="8"/>` },
    { id: 'library',  label: 'Library',  icon: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>` },
    { id: 'settings', label: 'Settings', icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>` },
  ];
</script>

<div id="tabbar">
  {#each tabs as tab}
    <button
      class="tab-btn"
      class:on={$activeTab === tab.id}
      data-tab={tab.id}
      on:click={() => activeTab.set(tab.id)}
    >
      {#if tab.id === 'search' && $nowSong && $playing}
        <div class="eq-bars active">
          <span></span><span></span><span></span>
        </div>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          {@html tab.icon}
        </svg>
      {/if}
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  #tabbar {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: var(--tab-h);
    padding-bottom: env(safe-area-inset-bottom);
    display: flex; align-items: flex-start;
    background: rgba(0,8,20,.85);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,.06);
    z-index: 40;
  }
  .tab-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 3px; padding: 8px 4px;
    color: var(--fg3); transition: color .15s;
  }
  .tab-btn.on { color: var(--accent); }
  .tab-btn svg { width: 22px; height: 22px; }
  .tab-label { font-size: 10px; font-weight: 500; }
</style>
