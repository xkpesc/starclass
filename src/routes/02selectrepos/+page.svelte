<script lang="ts">
    import { RecursiveTreeView, TreeView, TreeViewItem, type TreeViewNode } from "@skeletonlabs/skeleton";
    import { onMount } from "svelte";
    import { loadStarredReposFromDB, initDB, updateSelectedReposInDB } from "$lib/GithubStarredRepos";
    import ContainerSlot from "$lib/ContainerSlot.svelte";

    let reposTreeViewNodes: TreeViewNode[] = [];
    let checkedNodes: string[] = [];

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
                content: entry.name, // Display the repository name
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
            };
        });
        console.log(nodes);
        reposTreeViewNodes = nodes;
        checkedNodes = nodes.map((node) => node.id); // Optional: Preselect all nodes
    }

    // Save the updated list of selected repositories to IndexedDB
    async function saveUpdatedList() {
        const selectedRepos = reposTreeViewNodes.filter(node => checkedNodes.includes(node.id)).map(node => ({ id: node.id, selected: true }));
        await updateSelectedReposInDB(selectedRepos);
        console.log("Updated selected repositories saved to IndexedDB.");
    }
</script>

<!-- <ContainerSlot> -->
    <p class="p text-center">{checkedNodes.length} selected starred repositories</p>
    <!-- TODO delayed: add quick search -->
    
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
