<!-- 
========================================
File: src/routes/03fetchreadmes/+page.svelte
========================================
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { writable } from "svelte/store";
    import { ProgressRadial, ProgressBar } from "@skeletonlabs/skeleton";
    import { processReadmes, loadStarredReposFromDB } from "$lib/GithubStarredRepos";
    import ContainerSlot from "$lib/ContainerSlot.svelte";

    let progressMessage = writable("Click 'Fetch README Files' to start");
    let loading = writable(false);
    let repos = [];
    let checkedNodes = [];
    let fetched = writable(0);
    let total = writable(0);
    let abortController: AbortController | null = null;

    onMount(async (): Promise<void> => {
        // Load all the starred repositories from the database
        repos = await loadStarredReposFromDB();
        checkedNodes = repos.filter((repo) => repo.selected).map((repo) => repo.id);
        console.log(`Loaded ${repos.length} on fetchreadmes`);
    });

    async function triggerFetchReadmeFiles() {
        if (checkedNodes.length === 0) {
            progressMessage.set("No repositories selected. Please select starred repos first.");
            return;
        }

        const selectedRepos = repos.filter((repo) => checkedNodes.includes(repo.id));
        
        loading.set(true);
        progressMessage.set("Starting to fetch README files...");
        fetched.set(0);
        total.set(selectedRepos.length);
        abortController = new AbortController();

        try {
            for await (const progress of processReadmes(selectedRepos, abortController)) {
                if (progress.fetched !== undefined) {
                    fetched.set(progress.fetched);
                    total.set(progress.total);
                }
                progressMessage.set(progress.status);
            }
            progressMessage.set("README files fetched successfully.");
        } catch (error) {
            if (abortController?.signal.aborted) {
                progressMessage.set("Fetching process was aborted.");
            } else {
                progressMessage.set(`Error: ${error.message}`);
            }
        } finally {
            loading.set(false);
        }
    }

    function abortFetch() {
        if (abortController) {
            abortController.abort();
            loading.set(false);
            progressMessage.set("Fetching process aborted by user.");
        }
    }
</script>

<ContainerSlot>
    <h2>Fetch Readme Files</h2>
    <p>This step will retrieve the README files for the repositories you selected.</p>
    <p class="p text-center">{checkedNodes.length} selected starred repositories</p>
    <button class="btn variant-filled" on:click={triggerFetchReadmeFiles} disabled={$loading}>
        Fetch README Files
    </button>

    {#if $loading}
        <button class="btn variant-filled danger ml-2" on:click={abortFetch}>
            Abort
        </button>
        <ProgressRadial value={undefined} width="w-16" />
    {/if}

    <ProgressBar value={$fetched} max={$total} />

    <p>{$progressMessage}</p>
</ContainerSlot>
<!-- 
========================================
End of File: src/routes/03fetchreadmes/+page.svelte
========================================
-->

