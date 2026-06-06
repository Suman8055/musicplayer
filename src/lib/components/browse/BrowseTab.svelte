<script>
  import { onMount } from 'svelte';
  import { activeTab } from '$lib/stores/ui.js';
  import { fetchModules, fetchAlbumSongs, fetchPlaylistSongs, fetchCharts, filterByLanguage, LANG_TILES } from '$lib/api.js';
  import { buildForYouRows, intelTotalPlays, _timeGreeting } from '$lib/smartPlay.js';
  import { play } from '$lib/playback.js';
  import { cacheSongs, bestImg } from '$lib/utils.js';
  import SongRow from '$lib/components/shared/SongRow.svelte';

  let activeLang = LANG_TILES[0].lang;
  let modules = null;
  let forYouRows = [];
  let charts = [];
  let loading = true;

  // Detail slide-in state
  let detailOpen = false;
  let detailTitle = '';
  let detailSongs = [];
  let detailLoading = false;

  $: if ($activeTab === 'browse' && !modules) loadBrowse();

  async function loadBrowse() {
    loading = true;
    try {
      [modules, charts, forYouRows] = await Promise.allSettled([
        fetchModules(activeLang),
        fetchCharts(activeLang),
        intelTotalPlays() >= 5 ? buildForYouRows() : Promise.resolve([]),
      ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : null));
    } finally { loading = false; }
  }

  async function switchLang(lang) {
    activeLang = lang;
    modules = null;
    await loadBrowse();
  }

  async function openDetail(id, type, title) {
    detailTitle = title;
    detailSongs = [];
    detailOpen = true;
    detailLoading = true;
    try {
      const songs = type === 'playlist' ? await fetchPlaylistSongs(id) : await fetchAlbumSongs(id);
      detailSongs = filterByLanguage(songs, activeLang);
      cacheSongs(detailSongs);
    } finally { detailLoading = false; }
  }

  function playSong(song, songs, idx) { play(song, songs, idx); }

  // Trending songs — show all, no language filter (already scoped by activeLang query)
  $: trendingSongs = (modules?.trending?.songs ?? []).map(normTrendingItem).filter(s => s.id);
  // Trending albums — separate horizontal row
  $: trendingAlbums = (modules?.trending?.albums ?? []).filter(a => a.type === 'album').slice(0, 10);
  // New Releases — API mixes song+album types, keep only proper albums
  $: newReleases = (modules?.albums ?? []).filter(a => a.type === 'album').slice(0, 15);

  function normTrendingItem(s) {
    const pa = s.primaryArtists;
    const artist = Array.isArray(pa) ? pa.map(a => a.name).filter(Boolean).join(', ')
                 : (typeof pa === 'string' ? pa : '');
    return { id: s.id, name: s.name || '', artist, image: s.image, language: s.language || '', type: s.type };
  }
</script>

<div class="tab-pane" class:active={$activeTab === 'browse'} id="tab-browse">
  <div class="tab-header">
    Discover
    <span class="greeting">{_timeGreeting()}</span>
  </div>

  <!-- Language pills -->
  <div class="lang-pills">
    {#each LANG_TILES as { lang, label }}
      <button class="lang-pill" class:active={activeLang === lang} on:click={() => switchLang(lang)}>
        {label}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="empty-wrap"><div class="spinner"></div></div>
  {:else}
    <!-- For You section -->
    {#if forYouRows.length}
      <div class="section-title">For You</div>
      {#each forYouRows as row}
        <div class="disc-hd">
          <span class="disc-hd-title">{row.label}</span>
          {#if row.reason}<span class="disc-reason">{row.reason}</span>{/if}
        </div>
        <div class="scroll-fade-wrap">
          <div class="h-scroll">
            {#each row.songs as song, i}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div class="content-card" on:click={() => playSong(song, row.songs, i)}>
                <img src={bestImg(song.image, '150x150')} alt="" class="card-img" loading="lazy" />
                <div class="card-name">{song.name}</div>
                <div class="card-sub">{song.artist}</div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}

    <!-- Trending Today -->
    {#if trendingSongs.length}
      <div class="section-title">Trending Today · {activeLang}</div>
      <div class="scroll-fade-wrap">
        <div class="h-scroll">
          {#each trendingSongs as song, i}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => playSong(song, trendingSongs, i)}>
              <img src={bestImg(song.image, '150x150')} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{song.name}</div>
              <div class="card-sub">{song.artist}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Trending Albums -->
    {#if trendingAlbums.length}
      <div class="section-title">Trending Albums</div>
      <div class="scroll-fade-wrap">
        <div class="h-scroll">
          {#each trendingAlbums as album}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openDetail(album.id, 'album', album.name || album.title)}>
              <img src={bestImg(album.image, '150x150')} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{album.name || album.title}</div>
              <div class="card-sub">{Array.isArray(album.primaryArtists) ? album.primaryArtists.map(a=>a.name).join(', ') : (album.subtitle || album.language || '')}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- New Releases -->
    {#if newReleases.length}
      <div class="section-title">New Releases</div>
      <div class="scroll-fade-wrap">
        <div class="h-scroll">
          {#each newReleases as album}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openDetail(album.id, 'album', album.name || album.title)}>
              <img src={bestImg(album.image, '150x150')} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{album.name || album.title}</div>
              <div class="card-sub">{Array.isArray(album.primaryArtists) ? album.primaryArtists.map(a=>a.name).join(', ') : (album.subtitle || album.language || '')}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Charts -->
    {#if charts.length}
      <div class="section-title">Charts · {charts.length} playlists</div>
      {#each charts as chart}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="chart-row" on:click={() => openDetail(chart.id, 'playlist', chart.title || chart.name)}>
          <img src={bestImg(chart.image, '80x80')} alt="" class="chart-img" loading="lazy" />
          <div class="chart-info">
            <div class="chart-title">{chart.title || chart.name}</div>
            <div class="chart-sub">{chart.subtitle || chart.language || ''}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      {/each}
    {/if}
  {/if}

  <!-- Browse Detail Slide-in -->
  <div id="browse-detail" class:open={detailOpen}>
    <div class="pl-view-hdr">
      <button class="back-btn" on:click={() => detailOpen = false}>‹ Browse</button>
      <div class="pl-view-title">{detailTitle}</div>
      <div></div>
    </div>
    {#if detailLoading}
      <div class="empty-wrap"><div class="spinner"></div></div>
    {:else}
      {#each detailSongs as song, i}
        <SongRow {song} onPlay={() => playSong(song, detailSongs, i)} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .tab-header { font-size: 22px; font-weight: 700; padding: 16px 16px 8px; display: flex; align-items: baseline; gap: 8px; }
  .greeting { font-size: 13px; font-weight: 400; color: var(--fg3); }
  .lang-pills { display: flex; gap: 6px; padding: 0 16px 12px; overflow-x: auto; }
  .lang-pill { padding: 6px 14px; border-radius: 20px; font-size: 13px; background: var(--bg3); color: var(--fg3); border: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
  .lang-pill.active { background: var(--accent); color: #fff; border-color: transparent; }
  .section-title { font-size: 13px; font-weight: 600; color: var(--fg3); padding: 10px 16px 4px; text-transform: uppercase; letter-spacing: .05em; }
  .disc-hd { padding: 10px 16px 2px; }
  .disc-hd-title { font-size: 16px; font-weight: 700; }
  .disc-reason { font-size: 11px; color: var(--fg3); margin-left: 6px; }
  .scroll-fade-wrap { position: relative; }
  .h-scroll { display: flex; gap: 10px; overflow-x: auto; padding: 8px 16px; }
  .h-scroll::-webkit-scrollbar { display: none; }
  .content-card { flex-shrink: 0; width: 120px; cursor: pointer; }
  .card-img { width: 120px; height: 120px; border-radius: 10px; object-fit: cover; display: block; }
  .card-name { font-size: 12px; font-weight: 600; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-sub { font-size: 11px; color: var(--fg3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chart-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; }
  .chart-row:active { background: rgba(255,255,255,.05); }
  .chart-img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
  .chart-info { flex: 1; min-width: 0; }
  .chart-title { font-size: 14px; font-weight: 600; }
  .chart-sub { font-size: 12px; color: var(--fg3); }
  #browse-detail {
    position: fixed; inset: 0; z-index: 50;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #browse-detail.open { transform: translateX(0); }
  .pl-view-hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; padding-top: calc(16px + env(safe-area-inset-top)); }
  .back-btn { font-size: 15px; color: var(--accent); }
  .pl-view-title { font-size: 16px; font-weight: 700; text-align: center; flex: 1; }
</style>
