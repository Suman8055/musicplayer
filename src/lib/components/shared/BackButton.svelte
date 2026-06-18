<script>
  export let label = 'Back';
  export let onClick = () => {};
</script>

<button class="back-btn" on:click={onClick} aria-label="Go back to {label}">‹ {label}</button>

<style>
  .back-btn {
    font-size: 15px; color: var(--accent);
    min-height: 44px; min-width: 44px;
    display: flex; align-items: center;
    padding: 0 4px;
    touch-action: manipulation;
  }
</style>
