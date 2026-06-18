<!-- D14: Skeleton card for horizontal scroll rows (album/artist cards) -->
<div class="skeleton-card">
  <div class="skeleton-img skeleton-shimmer"></div>
  <div class="skeleton-line skeleton-shimmer" style="width:80%;margin-top:6px"></div>
  <div class="skeleton-line skeleton-shimmer" style="width:55%;margin-top:4px"></div>
</div>

<style>
  .skeleton-card { flex-shrink: 0; width: 120px; }
  .skeleton-img { width: 120px; height: 120px; border-radius: 10px; background: var(--bg3); }
  .skeleton-line { height: 10px; border-radius: 5px; background: var(--bg3); }
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
