<script>
  import { onMount } from 'svelte';
  import { activeTab } from '$lib/stores/ui.js';
  import { fetchModules, fetchAlbumSongs, fetchPlaylistSongs, fetchCharts, fetchFeaturedPlaylists, fetchArtistTopSongs, fetchArtistAlbums, fetchArtistMeta, filterByLanguage, LANG_TILES } from '$lib/api.js';
  import { buildForYouRows, intelTotalPlays, _timeGreeting } from '$lib/smartPlay.js';
  import { play } from '$lib/playback.js';
  import { cacheSongs, bestImg, decodeHtml } from '$lib/utils.js';
  import { showSheet, toast } from '$lib/stores/ui.js';
  import { downloadedIds, playlists } from '$lib/stores/library.js';
  import { downloadSong, removeDownload } from '$lib/idb.js';
  import { apiStream } from '$lib/api.js';
  import { get } from 'svelte/store';
  import SongRow from '$lib/components/shared/SongRow.svelte';

  let activeLang = LANG_TILES[0].lang;
  let modules = null;
  let forYouRows = [];
  let charts = [];
  let featuredPlaylists = [];
  let loading = true;

  // Detail slide-in state (album / playlist)
  let detailOpen = false;
  let detailTitle = '';
  let detailSongs = [];
  let detailLoading = false;

  // Artist detail slide-in
  let artistDetailOpen = false;
  let artistDetailLoading = false;
  let artistMeta = null;
  let artistTopSongs = [];
  let artistAlbums = [];

  // Album from artist sub-detail
  let albumFromArtistOpen = false;
  let albumFromArtistTitle = '';
  let albumFromArtistSongs = [];
  let albumFromArtistLoading = false;

  $: if ($activeTab === 'browse' && !modules) loadBrowse();

  async function loadBrowse() {
    loading = true;
    try {
      [modules, charts, featuredPlaylists, forYouRows] = await Promise.allSettled([
        fetchModules(activeLang),
        fetchCharts(activeLang),
        fetchFeaturedPlaylists(activeLang),
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

  async function openArtistDetail(artistId, artistName) {
    artistMeta = null;
    artistTopSongs = [];
    artistAlbums = [];
    artistDetailOpen = true;
    artistDetailLoading = true;
    try {
      const [meta, songs, albums] = await Promise.allSettled([
        fetchArtistMeta(artistId),
        fetchArtistTopSongs(artistId, 20),
        fetchArtistAlbums(artistId, 10),
      ]);
      artistMeta = meta.status === 'fulfilled' ? meta.value : { name: artistName, image: null };
      artistTopSongs = songs.status === 'fulfilled' && songs.value.length ? songs.value : [];
      artistAlbums = albums.status === 'fulfilled' ? albums.value : [];
      cacheSongs(artistTopSongs);
    } finally { artistDetailLoading = false; }
  }

  async function openAlbumFromArtist(albumId, albumName) {
    albumFromArtistTitle = albumName;
    albumFromArtistSongs = [];
    albumFromArtistOpen = true;
    albumFromArtistLoading = true;
    try {
      const songs = await fetchAlbumSongs(albumId);
      albumFromArtistSongs = songs;
      cacheSongs(songs);
    } finally { albumFromArtistLoading = false; }
  }

  function playSong(song, songs, idx) { play(song, songs, idx); }

  function onMoreSong(song) {
    const dl = get(downloadedIds).has(song.id);
    const pls = get(playlists);
    showSheet(song.name, [
      ...(pls.length ? [{ label: 'Add to Playlist', action: () => {
        showSheet(`Add "${song.name}" to…`, pls.map(pl => ({
          label: pl.name,
          action: () => {
            playlists.update(arr => arr.map(p =>
              p.id === pl.id
                ? { ...p, songs: p.songs.some(s => s.id === song.id) ? p.songs : [...p.songs, song] }
                : p
            ));
            toast(`Added to ${pl.name}`);
          }
        })));
      }}] : []),
      { label: dl ? 'Remove Download' : 'Download', action: () => {
        if (dl) removeDownload(song, toast, null).catch(() => {});
        else downloadSong(song, toast, apiStream).catch(() => {});
      }},
    ]);
  }

  // Trending songs — show all, no language filter (already scoped by activeLang query)
  $: trendingSongs = (modules?.trending?.songs ?? []).map(normTrendingItem).filter(s => s.id);
  // Trending albums — separate horizontal row
  $: trendingAlbums = (modules?.trending?.albums ?? []).filter(a => a.type === 'album').slice(0, 10);
  // New Releases — API mixes song+album types, keep only proper albums
  $: newReleases = (modules?.albums ?? []).filter(a => a.type === 'album').slice(0, 15);
  // Top Artists — from modules.artists array
  $: topArtists = (modules?.artists ?? []).slice(0, 15).map(a => ({
    id:    a.id,
    name:  decodeHtml(a.name || ''),
    image: bestImg(a.image, '150x150'),
  })).filter(a => a.id);

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

    <!-- Top Artists -->
    {#if topArtists.length}
      <div class="section-title">Top Artists</div>
      <div class="scroll-fade-wrap">
        <div class="h-scroll">
          {#each topArtists as artist}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openArtistDetail(artist.id, artist.name)}>
              <img src={artist.image} alt="" class="card-img artist-img" loading="lazy" />
              <div class="card-name" style="text-align:center">{artist.name}</div>
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

    <!-- Featured Playlists -->
    {#if featuredPlaylists?.length}
      <div class="section-title">Featured Playlists</div>
      <div class="scroll-fade-wrap">
        <div class="h-scroll">
          {#each featuredPlaylists as pl}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openDetail(pl.id, 'playlist', pl.name)}>
              <img src={bestImg(pl.image, '150x150')} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{pl.name}</div>
              <div class="card-sub">{pl.subtitle || ''}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Browse Detail Slide-in (album / playlist) -->
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
        <SongRow {song} onPlay={() => playSong(song, detailSongs, i)} onMore={(s) => onMoreSong(s)} />
      {/each}
    {/if}
  </div>

  <!-- Artist Detail Slide-in -->
  <div id="browse-artist-detail" class:open={artistDetailOpen}>
    <div class="pl-view-hdr" style="position:sticky;top:0;background:var(--bg);z-index:1">
      <button class="back-btn" on:click={() => artistDetailOpen = false}>‹ Browse</button>
      <div class="pl-view-title">{artistDetailLoading ? '' : (artistMeta?.name || '')}</div>
      <div></div>
    </div>
    {#if artistDetailLoading}
      <div class="empty-wrap"><div class="spinner"></div></div>
    {:else}
      {#if artistMeta?.image}
        <div class="artist-hero">
          <img class="artist-hero-img" src={artistMeta.image} alt={artistMeta.name} />
          <div class="artist-hero-overlay">
            <div class="artist-hero-name">{artistMeta.name}</div>
            {#if artistMeta.followers}<div class="artist-followers">{artistMeta.followers} followers</div>{/if}
          </div>
        </div>
      {/if}
      {#if artistTopSongs.length}
        <div class="section-title" style="padding-top:12px">Top Songs</div>
        {#each artistTopSongs as song, i}
          <SongRow {song} onPlay={() => playSong(song, artistTopSongs, i)} onMore={(s) => onMoreSong(s)} />
        {/each}
      {/if}
      {#if artistAlbums.length}
        <div class="section-title">Albums</div>
        <div class="h-scroll" style="padding: 8px 16px 16px;">
          {#each artistAlbums as album}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="content-card" on:click={() => openAlbumFromArtist(album.id, album.name)}>
              <img src={album.image} alt="" class="card-img" loading="lazy" />
              <div class="card-name">{album.name}</div>
              <div class="card-sub">{album.subtitle || ''}</div>
            </div>
          {/each}
        </div>
      {/if}
      {#if !artistTopSongs.length && !artistAlbums.length}
        <div class="empty-wrap">No content found</div>
      {/if}
    {/if}

    <!-- Album from Artist sub-detail -->
    <div id="browse-album-from-artist" class:open={albumFromArtistOpen}>
      <div class="pl-view-hdr">
        <button class="back-btn" on:click={() => albumFromArtistOpen = false}>‹ {artistMeta?.name || ''}</button>
        <div class="pl-view-title">{albumFromArtistTitle}</div>
        <div></div>
      </div>
      {#if albumFromArtistLoading}
        <div class="empty-wrap"><div class="spinner"></div></div>
      {:else}
        {#each albumFromArtistSongs as song, i}
          <SongRow {song} onPlay={() => playSong(song, albumFromArtistSongs, i)} onMore={(s) => onMoreSong(s)} />
        {/each}
      {/if}
    </div>
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
  #browse-artist-detail {
    position: fixed; inset: 0; z-index: 52;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #browse-artist-detail.open { transform: translateX(0); }
  #browse-album-from-artist {
    position: fixed; inset: 0; z-index: 54;
    background: var(--bg); overflow-y: auto;
    transform: translateX(100%);
    transition: transform .32s cubic-bezier(.32,.72,0,1);
  }
  #browse-album-from-artist.open { transform: translateX(0); }
  .pl-view-hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; padding-top: calc(16px + env(safe-area-inset-top)); }
  .back-btn { font-size: 15px; color: var(--accent); }
  .pl-view-title { font-size: 16px; font-weight: 700; text-align: center; flex: 1; }
  .empty-wrap { display: flex; align-items: center; justify-content: center; padding: 60px 16px; color: var(--fg3); font-size: 14px; }
  .artist-img { border-radius: 50% !important; }
  .artist-hero { position: relative; width: 100%; max-height: 260px; overflow: hidden; }
  .artist-hero-img { width: 100%; height: 260px; object-fit: cover; display: block; }
  .artist-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 50%); display: flex; flex-direction: column; justify-content: flex-end; padding: 16px; }
  .artist-hero-name { font-size: 26px; font-weight: 800; color: #fff; }
  .artist-followers { font-size: 13px; color: rgba(255,255,255,.6); }
</style>
