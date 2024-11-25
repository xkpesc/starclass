<script lang="ts">
  import { getTokenFromLocalStorage, saveToken } from "$lib/GithubAuth";
  import { getStarredRepos } from "$lib/GithubStarredRepos";
  import ContainerSlot from "$lib/ContainerSlot.svelte";
  import { onMount } from "svelte";

  let githubToken = "";

  // Initialize the token value on mount
  onMount(() => {
    githubToken = getTokenFromLocalStorage();
  });

  // Function to save the token from the input field
  function handleSaveToken() {
    saveToken(githubToken);
  }
</script>

<ContainerSlot>
  <h1>GitHub Token Input</h1>
  <input
    class="input"
    type="text"
    bind:value={githubToken}
    placeholder="Enter GitHub Token"
  />
  <button class="btn variant-filled" on:click={handleSaveToken}>Save Token</button>
  <button class="btn variant-filled" on:click={() => getStarredRepos(1, 3)}>
    Get Starred Repos (First 3 Pages)
  </button>
</ContainerSlot>
