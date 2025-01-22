/*
========================================
File: GithubStarredRepos.ts
========================================
*/

import { getOctokitInstance } from "./GithubAuth";
import { openDB, type IDBPDatabase } from "idb";

const README_STORE = "readmes";
const STARS_STORE = "stars";
const DESCRIPTIONS_STORE = "descriptions";

const possiblePaths: string[] = [
    "README.md",
    "README",
    "readme.md",
    "readme",
    "Readme.md",
];

let db: IDBPDatabase | undefined;

// Initialize the IndexedDB with all required stores
export async function initDB(): Promise<void> {
    db = await openDB("githubDB", 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(README_STORE)) {
                db.createObjectStore(README_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STARS_STORE)) {
                db.createObjectStore(STARS_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(DESCRIPTIONS_STORE)) {
                db.createObjectStore(DESCRIPTIONS_STORE, { keyPath: "id" });
            }
        },
    });
}

// Ensure that the database is initialized and the required stores exist
async function ensureDBInitialized(): Promise<void> {
    if (!db) {
        await initDB();
    }
    const dbStores = db!.objectStoreNames;
    const requiredStores = [README_STORE, STARS_STORE, DESCRIPTIONS_STORE];
    for (const store of requiredStores) {
        if (!dbStores.contains(store)) {
            await initDB();
            break;
        }
    }
}

// Function to get N READMEs from the IndexedDB
export async function getReadmes(limit: number = 0): Promise<any[]> {
    await ensureDBInitialized();
    const tx = db!.transaction(README_STORE, "readonly");
    const store = tx.objectStore(README_STORE);
    const readmes: any[] = [];
    
    let cursor = await store.openCursor();
    let count = 0;

    while (cursor) {
        readmes.push(cursor.value);
        count++;
        if (limit > 0 && count >= limit) {
            break;
        }
        cursor = await cursor.continue();
    }

    return readmes;
}

// Load the last starred repo timestamp to determine the point to resume fetching
async function getLastStarredRepo(): Promise<string | null> {
    await ensureDBInitialized();
    const repos = await loadStarredReposFromDB();
    if (repos.length > 0) {
        const sortedRepos = repos.sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime());
        return sortedRepos[0].starred_at;
    }
    return null;
}

// Main function to get starred repos with a stopping point based on the last fetch
export async function* getStarredRepos(page: number = 1, page_end: number = -1, abortController?: AbortController): AsyncGenerator<{ status: string, repos?: any[] }, void, unknown> {
    const octokit = getOctokitInstance();
    const stopAt = await getLastStarredRepo();
    try {
        while (true) {
            if (abortController?.signal.aborted) {
                yield { status: "Operation aborted by user." };
                return;
            }

            const response = await octokit.request("GET /user/starred", {
                per_page: 100,
                page: page,
                sort: "created",
                direction: "desc",
                headers: {
                    accept: "application/vnd.github.star+json",
                },
            });
            const repos = response.data.map((repo: any) => ({
                id: repo.repo.id,
                full_name: repo.repo.full_name,
                description: repo.repo.description,
                url: repo.repo.html_url,
                starred_at: repo.starred_at,
                language: repo.repo.language,
                github_readme_filename: null,
                selected: true,
            }));
            yield { status: `Page ${page}: fetched ${repos.length} repos`, repos };

            // Stop fetching if we've reached already fetched repos
            if (stopAt && repos.some((r: any) => new Date(r.starred_at) <= new Date(stopAt))) {
                yield { status: "All new repos are up-to-date." };
                return;
            }

            await saveStarredReposToDB(repos);

            if (repos.length < 100 || (page_end !== -1 && page >= page_end)) {
                return;
            }

            page++;
        }
    } catch (error: any) {
        yield { status: `Error fetching starred repositories: ${error}` };
    }
}

// Save or update starred repos to IndexedDB
export async function saveStarredReposToDB(repos: any[]): Promise<void> {
    await ensureDBInitialized();
    const tx = db!.transaction(STARS_STORE, "readwrite");
    const store = tx.objectStore(STARS_STORE);

    for (const repo of repos) {
        await store.put({ id: repo.id, full_name: repo.full_name, ...repo });
    }
    console.log(`Saved or updated ${repos.length} repos to IndexedDB in store ${STARS_STORE}.`);
}

// Update selected repos in IndexedDB
export async function updateSelectedReposInDB(selectedRepos: { id: string; selected: boolean }[]): Promise<void> {
    await ensureDBInitialized();
    const tx = db!.transaction(STARS_STORE, "readwrite");
    const store = tx.objectStore(STARS_STORE);
    for (const repo of selectedRepos) {
        const existingRepo = await store.get(repo.id);
        if (existingRepo) {
            existingRepo.selected = repo.selected;
            await store.put(existingRepo);
        }
    }

    console.log(`Updated ${selectedRepos.length} repos with 'selected' field in IndexedDB.`);
}

// Load starred repos from IndexedDB
export async function loadStarredReposFromDB(): Promise<any[]> {
    await ensureDBInitialized();
    const tx = db!.transaction(STARS_STORE, "readonly");
    const store = tx.objectStore(STARS_STORE);
    const repos = await store.getAll();
    return repos;
}

// Process README files for all repositories
export async function* processReadmes(repos: any[], abortController?: AbortController): AsyncGenerator<{ status: string, fetched?: number, total?: number }, void, unknown> {
    await ensureDBInitialized();
    const existingRepos = await loadStarredReposFromDB();
    const existingRepoMap = new Map(existingRepos.map((repo) => [repo.id, repo]));

    let fetched = 0;
    const total = repos.length;

    for (const repo of repos) {
        if (abortController?.signal.aborted) {
            yield { status: "Operation aborted by user.", fetched, total };
            return;
        }

        const [owner, repoName] = repo.full_name.split("/");

        // Skip repos where github_readme_filename is already populated or marked as unavailable
        if (existingRepoMap.has(repo.id) && existingRepoMap.get(repo.id).github_readme_filename !== null) {
            console.log(`Skipping ${repo.full_name} as README is already processed.`)
            yield { status: `Skipping ${repo.full_name} as README is already processed.`, fetched, total };
            continue;
        }

        const { content, originalReadmeName } = await fetchReadmeWithFileName(owner, repoName);
        if (content) {
            const savedFileName = await saveReadmeToDB(repo.id, repo.full_name, content);
            repo.github_readme_filename = originalReadmeName;
        } else {
            repo.github_readme_filename = false;
        }
        fetched++;

        // Update the IndexedDB with the readme filename immediately after processing each repo
        const tx = db!.transaction(STARS_STORE, "readwrite");
        const store = tx.objectStore(STARS_STORE);
        await store.put({ id: repo.id, full_name: repo.full_name, ...repo });

        yield { status: `Processed README for ${repo.full_name}`, fetched, total };
    }

    yield { status: `Processing complete.`, fetched, total };
}

// Fetch README or its variations from a repository
async function fetchReadmeWithFileName(owner: string, repo: string): Promise<{ content: string | null; originalReadmeName: string | null }> {
    const octokit = getOctokitInstance();
    for (const filePath of possiblePaths) {
        try {
            const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
                owner,
                repo,
                path: filePath,
                headers: {
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            //@ts-ignore
            if (response.status === 200 && response.data.content) {
                //@ts-ignore
                const content = atob(response.data.content);
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

// Save README content to IndexedDB
export async function saveReadmeToDB(repoId: string, fullName: string, content: string): Promise<string> {
    await ensureDBInitialized();
    const fileName = repoId;
    await db!.put(README_STORE, { id: fileName, full_name: fullName, content });
    console.log(`Saved README for ${fullName} to IndexedDB in store ${README_STORE}.`);
    return fileName;
}

// Save generated descriptions to IndexedDB
export async function saveDescriptions(
    descriptions: {
        id: string | number;
        repo_name: string;
        descriptions: string;
        timestamp: string;
    }[]
): Promise<void> {
    await ensureDBInitialized();
    const tx = db!.transaction(DESCRIPTIONS_STORE, "readwrite");
    const store = tx.objectStore(DESCRIPTIONS_STORE);

    for (const desc of descriptions) {
        await store.put(desc);
    }

    console.log(`Saved ${descriptions.length} descriptions to IndexedDB in store "${DESCRIPTIONS_STORE}".`);
}

// Get descriptions from IndexedDB
export async function getDescriptions(limit: number = 0): Promise<any[]> {
    await ensureDBInitialized();
    const tx = db!.transaction(DESCRIPTIONS_STORE, "readonly");
    const store = tx.objectStore(DESCRIPTIONS_STORE);
    const descriptions: any[] = [];
    
    let cursor = await store.openCursor();
    let count = 0;

    while (cursor) {
        descriptions.push(cursor.value);
        count++;
        if (limit > 0 && count >= limit) {
            break;
        }
        cursor = await cursor.continue();
    }

    return descriptions;
}

// Debug function to check if everything is OK with browser's IndexedDB
export async function logIndexedDBEntries(): Promise<any[]> {
    await ensureDBInitialized();

    const txReadme = db!.transaction(README_STORE, "readonly");
    const storeReadme = txReadme.objectStore(README_STORE);
    const readmeEntries: any[] = await storeReadme.getAll();

    const txStars = db!.transaction(STARS_STORE, "readonly");
    const storeStars = txStars.objectStore(STARS_STORE);
    const starsEntries: any[] = await storeStars.getAll();

    const txDescriptions = db!.transaction(DESCRIPTIONS_STORE, "readonly");
    const storeDescriptions = txDescriptions.objectStore(DESCRIPTIONS_STORE);
    const descriptionEntries: any[] = await storeDescriptions.getAll();

    console.log("IndexedDB Entries - README_STORE:", readmeEntries);
    console.log("IndexedDB Entries - STARS_STORE:", starsEntries);
    console.log("IndexedDB Entries - DESCRIPTIONS_STORE:", descriptionEntries);
    return [...readmeEntries, ...starsEntries, ...descriptionEntries];
}

/*
========================================
End of File: GithubStarredRepos.ts
========================================
*/
