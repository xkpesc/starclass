/*
========================================
File: IDBUtils.ts
========================================
Purpose:
  - Encapsulate all IndexedDB-related setup and general put/get logic
  - Provide simple store-specific helpers for readmes, stars, etc.
*/

import { openDB, type IDBPDatabase } from "idb";

// Names of the stores in a single DB
export const README_STORE = "readmes";
export const STARS_STORE = "stars";
export const DESCRIPTIONS_STORE = "descriptions";

let db: IDBPDatabase | undefined;

/**
 * Initialize the "githubDB" database with the required object stores.
 */
export async function initDB(): Promise<void> {
  db = await openDB("githubDB", 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(README_STORE)) {
        database.createObjectStore(README_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STARS_STORE)) {
        database.createObjectStore(STARS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DESCRIPTIONS_STORE)) {
        database.createObjectStore(DESCRIPTIONS_STORE, { keyPath: "id" });
      }
    }
  });
}

/**
 * Ensure DB is initialized; if not, call initDB().
 */
export async function ensureDBInitialized(): Promise<void> {
  if (!db) {
    await initDB();
  }
}

/**
 * Log all IndexedDB entries from all stores (for debugging).
 */
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

  console.log("IndexedDB - README_STORE:", readmeEntries);
  console.log("IndexedDB - STARS_STORE:", starsEntries);
  console.log("IndexedDB - DESCRIPTIONS_STORE:", descriptionEntries);

  return [...readmeEntries, ...starsEntries, ...descriptionEntries];
}

/**
 * Load all starred repos from IndexedDB.
 */
export async function loadStarredReposFromDB(): Promise<any[]> {
  await ensureDBInitialized();
  const tx = db!.transaction(STARS_STORE, "readonly");
  const store = tx.objectStore(STARS_STORE);
  return await store.getAll();
}

/**
 * Save or update starred repos in STARS_STORE.
 */
export async function saveStarredReposToDB(repos: any[]): Promise<void> {
  await ensureDBInitialized();
  const tx = db!.transaction(STARS_STORE, "readwrite");
  const store = tx.objectStore(STARS_STORE);

  for (const repo of repos) {
    await store.put({ ...repo });
  }
  console.log(`Saved or updated ${repos.length} repos to IndexedDB in store "${STARS_STORE}".`);
}

/**
 * Update a single repo's readme filename (or false if not found).
 */
export async function updateRepoWithReadmeFilename(repoId: string, filename: string | false): Promise<void> {
  await ensureDBInitialized();
  const tx = db!.transaction(STARS_STORE, "readwrite");
  const store = tx.objectStore(STARS_STORE);

  const existingRepo = await store.get(repoId);
  if (existingRepo) {
    existingRepo.github_readme_filename = filename;
    await store.put(existingRepo);
  }
}

/**
 * Save README content to the README_STORE
 */
export async function saveReadmeToDB(repoId: string, fullName: string, content: string): Promise<void> {
  await ensureDBInitialized();
  const tx = db!.transaction(README_STORE, "readwrite");
  const store = tx.objectStore(README_STORE);

  await store.put({
    id: repoId,
    full_name: fullName,
    content
  });
  console.log(`Saved README for ${fullName} to IndexedDB (ID="${repoId}").`);
}

/**
 * Return a number of readmes from the README_STORE, or all if limit=0.
 */
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

/**
 * Expose the raw db instance if needed by other utils.
 */
export function getDBInstance(): IDBPDatabase | undefined {
  return db;
}
