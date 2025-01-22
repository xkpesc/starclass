<script>
    import { getStarredRepos  } from "$lib/GithubStarredRepos";
    import {logIndexedDBEntries} from "$lib/IDBUtils"
    import ContainerSlot from "$lib/ContainerSlot.svelte";
    import { ProgressRadial, SlideToggle } from "@skeletonlabs/skeleton";
    import { writable } from "svelte/store";

    let progressMessage = writable("Click 'Get Starred Repos' to begin");
    let loading = writable(false);

    async function fetchStarredRepos() {
        loading.set(true);
        progressMessage.set("Starting fetch...");

        try {
            // Iterate through the async generator to get progress updates
            for await (const { status } of getStarredRepos(1, 3)) {
                progressMessage.set(status);
            }
        } catch (error) {
            progressMessage.set(`Error: ${error.message}`);
        } finally {
            loading.set(false);
        }
    }
</script>

<ContainerSlot>
    <h1>Github Starred Repos</h1>

    <button class="btn variant-filled" on:click={fetchStarredRepos}>
        Get Starred Repos (First 3 Pages)
    </button>
    <button class="btn variant-filled" on:click={() => logIndexedDBEntries()}>
        Log IndexedDB Entries
    </button>

    {#if $loading}
        <ProgressRadial value={undefined} width="w-16" />
    {/if}

    <p>{$progressMessage}</p>

    <!-- TODO: models preload -->
    <SlideToggle name="preload_models" active="bg-primary-500" checked>Preload Models</SlideToggle>
    <p>The toggle above will preload {'<'}llm_model{'>'} and {'<'}embeddings_models{'>'} <br>
    You can also change the models settings later.</p>
</ContainerSlot>
