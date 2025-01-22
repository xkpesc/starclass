<!-- 
========================================
File: src/routes/02selectrepos/+page.svelte
========================================
-->

<script lang="ts">
    import { RecursiveTreeView, TreeView, TreeViewItem, type TreeViewNode } from "@skeletonlabs/skeleton";
    import { onMount } from "svelte";
    import { loadStarredReposFromDB, initDB } from "$lib/IDBUtils";
    import ContainerSlot from "$lib/ContainerSlot.svelte";
    import { writable } from "svelte/store";

    let reposTreeViewNodes: TreeViewNode[] = [];
    let checkedNodes: string[] = [];
    let selectAll = writable(false);

    onMount(async (): Promise<void> => {
        await initDB();
        await loadReadmeTreeNodes();
    });

    // Load readme nodes from IndexedDB
    async function loadReadmeTreeNodes(): Promise<void> {
        const entries = await loadStarredReposFromDB(); // Load repos from the STARS_STORE
        const nodes = entries.map((entry) => {
            return {
                id: entry.id,
                content: entry.full_name, // Display the repository name
                children: [
                    {
                        id: `${entry.id}-description`,
                        content: `Description: ${entry.description || 'No description available'}`,
                    },
                    {
                        id: `${entry.id}-url`,
                        content: `URL: ${entry.url}`,
                    },
                    {
                        id: `${entry.id}-language`,
                        content: `Language: ${entry.language || 'Unknown'}`,
                    }
                ],
                selected: entry.selected // Use the 'selected' field from the IndexedDB to set initial selection state
            };
        });
        console.log(nodes);
        reposTreeViewNodes = nodes;
        checkedNodes = nodes.filter((node) => node.selected).map((node) => node.id); // Preselect nodes that were previously selected
        selectAll.set(checkedNodes.length === reposTreeViewNodes.length); // Update the selectAll checkbox state based on initial selection
    }

    // Save the updated list of selected repositories to IndexedDB
    async function saveUpdatedList() {
        const selectedRepos = reposTreeViewNodes.map((node) => ({
            id: node.id,
            selected: checkedNodes.includes(node.id),
        }));
        await updateSelectedReposInDB(selectedRepos);
        console.log("Updated selected repositories saved to IndexedDB.");
    }

    // Handle the Select All checkbox change
    function toggleSelectAll() {
        if ($selectAll) {
            checkedNodes = reposTreeViewNodes.map((node) => node.id); // Select all nodes
        } else {
            checkedNodes = []; // Deselect all nodes
        }
    }

    // Watch for changes to checkedNodes and update the selectAll state accordingly
    $: selectAll.set(checkedNodes.length === reposTreeViewNodes.length);
</script>

<!-- <ContainerSlot> -->
    <p class="p text-center">{checkedNodes.length} selected starred repositories</p>
    <!-- TODO delayed: add quick search -->

    <label>
        <input class="checkbox" type="checkbox" bind:checked={$selectAll} on:change={toggleSelectAll} /> Select All
    </label>
    
    <button class="btn variant-filled" on:click={saveUpdatedList}>
        Save Updated List
    </button>
    <div class="h-full overflow-auto">
        <RecursiveTreeView
            selection
            multiple
            hyphenOpacity="opacity-10"
            nodes={reposTreeViewNodes}
            regionChildren=""
            bind:checkedNodes
            class=""
        />
    </div>
<!-- </ContainerSlot> -->

<!-- 
========================================
End of File: src/routes/02selectrepos/+page.svelte
========================================
-->
