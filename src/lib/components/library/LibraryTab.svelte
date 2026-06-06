<script>
  import { activeTab, showSheet, toast, openPrompt } from '$lib/stores/ui.js';
  import { playlists, liked, downloadedIds } from '$lib/stores/library.js';
  import { play } from '$lib/playback.js';
  import { idbGetAll, removeDownload, downloadSong } from '$lib/idb.js';
  import { apiStream } from '$lib/api.js';
  import { get } from 'svelte/store';
  import SongRow from '$lib/components/shared/SongRow.svelte';

  let openPlView  = null;  // null or playlist object
  let openDlView  = false;
  let dlSongs     = [];

  function createPlaylist() {
    openPrompt('New Playlist', (name) => {
      playlists.update(arr => [...arr, { id: Date.now().toString(), name, songs: [] }]);
      toast('Playlist created');
    });
  }

  function openPlaylist(pl) { openPlView = pl; }
  function closePlaylist() { openPlView = null; }

  async function openDownloads() {
    openDlView = true;
    const all = await idbGetAll();
    dlSongs = all.filter(s => $downloadedIds.has(s.id));
  }

  function onMoreSong(song, source) {
    showSheet(song.name, [
      { label: 'Remove from Library', danger: true, action: () => {
        if (source === 'liked') { liked.update(arr => arr.filter(s => s.id !== song.id)); toast('Removed'); }
      }},
      { label: $downloadedIds.has(song.id) ? 'Remove Download' : 'Download', action: () => {
        if ($downloadedIds.has(song.id)) removeDownload(song, toast, null).catch(() => {});
        else downloadSong(song, toast, apiStream).catch(() => {});
      }},
    ]);
  }
</script>

<div class="tab-pane" class:active={$activeTab === 'library'} id="tab-library">
  <div class="tab-header">Library</div>

  <!-- Downloaded Songs -->
  {#if $downloadedIds.size > 0}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="pl-item" on:click={openDownloads}>
      <div class="pl-icon-box dl">⬇</div>
      <div>
        <div class="pl-name">Downloads</div>
        <div class="pl-count">{$downloadedIds.size} songs</div>
      </div>
    </div>
  {/if}

  <!-- Liked Songs -->
  {#if $liked.length > 0}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="pl-item" on:click={() => openPlView = { name: 'Liked Songs', songs: $liked, _liked: true }}>
      <div class="pl-icon-box liked">♥</div>
      <div>
        <div class="pl-name">Liked Songs</div>
        <div class="pl-count">{$liked.length} songs</div>
      </div>
    </div>
  {/if}

  <!-- New Playlist -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="pl-item" id="new-pl-btn" on:click={createPlaylist}>
    <div class="pl-icon-box">＋</div>
    <div>
      <div class="pl-name">New Playlist</div>
    </div>
  </div>

  <div class="sep"></div>

  <!-- User playlists -->
  {#each $playlists as pl}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="pl-item" on:click={() => openPlaylist(pl)}>
      <div class="pl-icon-box">♪</div>
      <div>
        <div class="pl-name">{pl.name}</div>
        <div class="pl-count">{pl.songs?.length ?? 0} songs</div>
      </div>
    </div>
  {/each}

  <!-- Playlist detail slide-in -->
  <div id="pl-view" class:open={!!openPlView || openDlView}>
    <div class="pl-view-hdr">
      <button class="back-btn" on:click={() => { openPlView = null; openDlView = false; }}>‹ Library</button>
      <div class="pl-view-title">{openPlView?.name ?? (openDlView ? 'Downloads' : '')}</div>
      <div></div>
    </div>
    {#if openDlView}
      {#each dlSongs as song, i}
        <SongRow {song} onPlay={() => play(song, dlSongs, i)} onMore={() => onMoreSong(song, 'dl')} />
      {/each}
    {:else if openPlView}
      {#each (openPlView.songs ?? []) as song, i}
        <SongRow {song} onPlay={() => play(song, openPlView.songs, i)} onMore={() => onMoreSong(song, openPlView._liked ? 'liked' : 'playlist')} />
      {/each}
      {#if !(openPlView.songs?.length)}
        <div class="empty-wrap">No songs yet</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .tab-header { font-size: 22px; font-weight: 700; padding: 16px 16px 8px; }
  .pl-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; }
  .pl-item:active { background: rgba(255,255,255,.05); }
  .pl-icon-box { width: 44px; height: 44px; border-radius: 10px; background: var(--bg3); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .pl-icon-box.liked { background: rgba(239,68,68,.15); color: #ef4444; }
  .pl-icon-box.dl { background: hsla(var(--accent-h),var(--accent-s),var(--accent-l),.15); color: var(--accent); }
  .pl-name { font-size: 15px; font-weight: 600; }
  .pl-count { font-size: 12px; color: var(--fg3); }
  .sep { height: 1px; background: rgba(255,255,255,.06); margin: 4px 16px; }
  #pl-view {
    position: fixed; inset: 0; z-index: 50;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #pl-view.open { transform: translateX(0); }
  .pl-view-hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; padding-top: calc(16px + env(safe-area-inset-top)); }
  .back-btn { font-size: 15px; color: var(--accent); }
  .pl-view-title { font-size: 16px; font-weight: 700; text-align: center; flex: 1; }
</style>
