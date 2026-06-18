<script>
  import SkeletonRow from './SkeletonRow.svelte';
  export let count = 6;
</script>

<!-- D14: A stack of skeleton rows for loading states -->
{#each Array(count) as _}
  <SkeletonRow />
{/each}
