<script lang="ts">
    import { onMount } from "svelte";
    import { writable } from "svelte/store";
    import { ProgressRadial } from "@skeletonlabs/skeleton";
    import { processReadmes, loadStarredReposFromDB } from "$lib/GithubStarredRepos";
    import ContainerSlot from "$lib/ContainerSlot.svelte";

    let progressMessage = writable("Click 'Fetch README Files' to start");
    let loading = writable(false);
    let repos = [];

    onMount(async (): Promise<void> => {
        // Load all the starred repositories from the database
        repos = await loadStarredReposFromDB();
        console.log(`Loaded ${repos.length} on fetchreadmes`)
    });

    async function fetchReadmeFiles() {
        if (repos.length === 0) {
            progressMessage.set("No repositories available. Please fetch starred repos first.");
            return;
        }

        loading.set(true);
        progressMessage.set("Starting to fetch README files...");

        try {
            await processReadmes(repos);
            progressMessage.set("README files fetched successfully.");
        } catch (error) {
            progressMessage.set(`Error: ${error.message}`);
        } finally {
            loading.set(false);
        }
    }
</script>

<ContainerSlot>
    <h2>Fetch Readme Files</h2>
    <p>This step will retrieve the README files for the repositories you selected.</p>

    <button class="btn variant-filled" on:click={fetchReadmeFiles}>
        Fetch README Files
    </button>

    {#if $loading}
        <ProgressRadial value={undefined} width="w-16" />
    {/if}

    <p>{$progressMessage}</p>
</ContainerSlot>
