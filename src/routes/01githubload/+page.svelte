<script>
    import { getStarredRepos, logIndexedDBEntries } from "$lib/GitHubStarredRepos";
    import ContainerSlot from "$lib/ContainerSlot.svelte";
    import { onMount } from "svelte";
</script>


<ContainerSlot>
    <h1>Github starred repos loading...</h1>

    <button class="btn variant-filled" on:click={() => getStarredRepos(1, 3)}>
      Get Starred Repos (First 3 Pages)
    </button>
    <button class="btn variant-filled" on:click={() => logIndexedDBEntries()}>
        logIndexedDBEntries
      </button>
  </ContainerSlot>