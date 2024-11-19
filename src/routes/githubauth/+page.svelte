<script lang="ts">
    import { onMount } from "svelte";
    import { openDB, type DBSchema, type IDBPDatabase } from "idb";
    import { Octokit } from "@octokit/core";
    import { RecursiveTreeView, type TreeViewNode } from "@skeletonlabs/skeleton";
    
    // GitHub OAuth configuration
    let githubToken: string = "";
    
    // Initialize Octokit instance
    let octokit: Octokit;
    
    // Constants
    const FILE_NAME = "starred_repos"; // LocalStorage key name for JSON data
    const README_FOLDER = "readmes";
    const possiblePaths: string[] = [
    "README.md",
    "README",
    "readme.md",
    "readme",
    "Readme.md",
    ];
    
    // Initialize IndexedDB
    let db: IDBPDatabase | undefined;
    async function initDB(): Promise<void> {
        db = await openDB("githubDB", 1, {
            upgrade(db) {
                db.createObjectStore(README_FOLDER, { keyPath: "id" });
            },
        });
    }
    
    // On component mount, initialize GitHub token and IndexedDB
    onMount(async (): Promise<void> => {
        githubToken = localStorage.getItem("github_token") || "";
        if (githubToken) {
            octokit = new Octokit({ auth: githubToken });
        }
        await initDB();
        await loadReadmeTreeNodes();
    });
    
    // Function to save GitHub token to local storage
    function saveToken(): void {
        if (githubToken) {
            localStorage.setItem("github_token", githubToken);
            console.log("GitHub token saved to local storage.");
            octokit = new Octokit({ auth: githubToken });
        } else {
            console.error("No token provided to save.");
        }
    }
    
    // Load starred repos from LocalStorage
    function loadStarredRepos(): any[] {
        const data = localStorage.getItem(FILE_NAME);
        return data ? JSON.parse(data) : [];
    }
    
    // Save starred repos to LocalStorage
    function saveStarredRepos(repos: any[]): void {
        const existingRepos = loadStarredRepos();
        const existingRepoMap = new Map(
        existingRepos.map((repo) => [repo.name, repo])
        );
        
        for (const repo of repos) {
            if (!existingRepoMap.has(repo.name)) {
                existingRepos.push(repo);
            } else {
                const existingRepo = existingRepoMap.get(repo.name);
                if (new Date(repo.starred_at) > new Date(existingRepo.starred_at)) {
                    Object.assign(existingRepo, repo);
                }
            }
        }
        
        localStorage.setItem(FILE_NAME, JSON.stringify(existingRepos));
        console.log(`Saved ${repos.length} repos to LocalStorage.`);
    }
    
    // Function to save README content to IndexedDB
    async function saveReadmeToFile(
    owner: string,
    repoName: string,
    content: string
    ): Promise<string> {
        const fileName = `${owner}+${repoName}.md`;
        await db?.put(README_FOLDER, { id: fileName, content });
        console.log(`Saved README for ${owner}/${repoName} to IndexedDB.`);
        return fileName;
    }
    
    // Fetch README or its variations from a repository
    async function fetchReadmeWithFileName(
    owner: string,
    repo: string
    ): Promise<{ content: string | null; originalReadmeName: string | null }> {
        for (const filePath of possiblePaths) {
            try {
                const response = await octokit.request(
                "GET /repos/{owner}/{repo}/contents/{path}",
                {
                    owner,
                    repo,
                    path: filePath,
                    headers: {
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                }
                );
                
                if (response.status === 200 && response.data.content) {
                    const content = atob(response.data.content); // Decode base64 content
                    return { content, originalReadmeName: filePath };
                }
            } catch (error: any) {
                if (error.status !== 404) {
                    console.error(`Error fetching README for ${owner}/${repo}:`, error);
                }
            }
        }
        
        return { content: null, originalReadmeName: null };
    }
    
    // Function to fetch user's starred repositories with pagination using Octokit
    async function getStarredRepos(
    page: number = 1,
    page_end: number = -1
    ): Promise<void> {
        if (!githubToken) {
            console.error("No GitHub token available.");
            return;
        }
        
        try {
            const response = await octokit.request("GET /user/starred", {
                per_page: 100,
                page: page,
                sort: "created",
                direction: "desc",
            });
            const repos = response.data;
            console.log(`Page ${page}: fetched ${repos.length} repos`);
            saveStarredRepos(repos);
            await processReadmes(repos);
            
            // If there are more pages to fetch and either page_end is -1 (all pages) or we haven't reached page_end yet
            if (repos.length === 100 && (page_end === -1 || page < page_end)) {
                await getStarredRepos(page + 1, page_end);
            }
        } catch (error: any) {
            console.error("Error fetching starred repositories: ", error);
        }
    }
    
    // Process readmes for all repos
    async function processReadmes(repos: any[]): Promise<void> {
        for (const repo of repos) {
            const [owner, repoName] = repo.full_name.split("/");
            const { content, originalReadmeName } = await fetchReadmeWithFileName(
            owner,
            repoName
            );
            
            if (content) {
                await saveReadmeToFile(owner, repoName, content);
            }
        }
    }
    
    // Function to load README files from IndexedDB and convert them into TreeView nodes
    let myTreeViewNodes: TreeViewNode[] = [];
    let checkedNodes: string[] = [];
    let indeterminateNodes: string[] = [];
    
    async function loadReadmeTreeNodes(): Promise<void> {
        const entries = await logIndexedDBEntries();
        const nodes = entries.map((entry) => {
            return {
                id: entry.id,
                content: entry.id,
                // children: [],
            };
        });
        console.log(nodes)
        myTreeViewNodes = nodes;
        checkedNodes = nodes.map((node) => node.id); // Set all nodes as checked
    }
    
    //debug function to check if everything is OK with browser's indexeddb
    async function logIndexedDBEntries(): Promise<any[]> {
        // Ensure the database is initialized
        if (!db) {
            console.log("Opening database...");
            db = await openDB("githubDB", 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(README_FOLDER)) {
                        db.createObjectStore(README_FOLDER, { keyPath: "id" });
                    }
                },
            });
        }
        
        const tx = db.transaction(README_FOLDER, "readonly");
        const store = tx.objectStore(README_FOLDER);
        
        const entries: any[] = [];
        for await (const cursor of store) {
            entries.push(cursor.value);
        }
        
        console.log("IndexedDB Entries:", entries);
        return entries;
    }
</script>

<div class="container h-full mx-auto flex justify-center items-center">
    <div class="space-y-10 text-center flex flex-col items-center">
        <h2>TREE</h2>
        <RecursiveTreeView
        selection
        multiple
        hyphenOpacity="opacity-10"
        nodes={myTreeViewNodes}
        bind:checkedNodes
        />
        
        <h1>GitHub Token Input</h1>
        <input
        class="input"
        type="text"
        bind:value={githubToken}
        placeholder="Enter GitHub Token"
        />
        <button class="btn variant-filled" on:click={saveToken}>Save Token</button>
        <button class="btn variant-filled" on:click={() => getStarredRepos(1, 3)}
            >Get Starred Repos (First 3 Pages)</button
            >
            <button class="btn variant-filled" on:click={logIndexedDBEntries}
            >logIndexedDBEntries</button
            >
        </div>
    </div>
    