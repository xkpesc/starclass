<!-- */
========================================
File: T src/routes/githubtree/+page.svelte
========================================
*/ -->

<script lang="ts">
    import { RecursiveTreeView, type TreeViewNode } from "@skeletonlabs/skeleton";
    import { onMount } from "svelte";
    import { logIndexedDBEntries, initDB } from "$lib/GitHubStarredRepos";
    import ContainerSlot from "$lib/ContainerSlot.svelte";

    let myTreeViewNodes: TreeViewNode[] = [];
    let checkedNodes: string[] = [];

    onMount(async (): Promise<void> => {
        await initDB();
        await loadReadmeTreeNodes();
    });

    async function loadReadmeTreeNodes(): Promise<void> {
        const entries = await logIndexedDBEntries();
        const nodes = entries.map((entry) => {
            return {
                id: entry.id,
                content: entry.id,
            };
        });
        console.log(nodes);
        myTreeViewNodes = nodes;
        checkedNodes = nodes.map((node) => node.id);
    }
</script>

<ContainerSlot>
    <h2>TREE</h2>
    <RecursiveTreeView
        selection
        multiple
        hyphenOpacity="opacity-10"
        nodes={myTreeViewNodes}
        bind:checkedNodes
    />
</ContainerSlot>

<!-- /*
========================================
End of File: TreeView.svelte
========================================
*/ -->