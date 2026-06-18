<!-- D14: Skeleton row for song lists -->
<div class="skeleton-row">
  <div class="skeleton-art skeleton-shimmer"></div>
  <div class="skeleton-info">
    <div class="skeleton-line skeleton-shimmer" style="width:65%"></div>
    <div class="skeleton-line skeleton-shimmer" style="width:40%;margin-top:6px"></div>
  </div>
</div>

<style>
  .skeleton-row { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
  .skeleton-art { width: 44px; height: 44px; border-radius: 6px; background: var(--bg3); flex-shrink: 0; }
  .skeleton-info { flex: 1; min-width: 0; }
  .skeleton-line { height: 11px; border-radius: 5px; background: var(--bg3); }
  @keyframes shimmer {
    0%   { background-position: -200px 0; }
    100% { background-position: calc(200px + 100%) 0; }
  }
  .skeleton-shimmer {
    background-image: linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,.06) 50%, var(--bg3) 75%);
    background-size: 200px 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
</style>
