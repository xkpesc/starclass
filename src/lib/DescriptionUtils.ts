/*
========================================
File: DescriptionUtils.ts
========================================
Purpose:
  - Provide functions for storing and retrieving
    generated descriptions (brief descriptions & keywords)
    from the DESCRIPTIONS_STORE
*/

import {
    ensureDBInitialized,
    DESCRIPTIONS_STORE,
    getDBInstance
  } from "./IDBUtils";
  
  /**
   * Save an array of descriptions to IndexedDB's DESCRIPTIONS_STORE.
   * Each description object now includes a "model" field indicating the model used in inference.
   */
  export async function saveDescriptions(
    descriptions: {
      id: string | number;
      full_name: string;
      description: string; // or any structure if you prefer
      model: string;       // new field for model name
      timestamp: string;
      status: string;      // new field to indicate generation status (e.g., "ok", "entropy_collapse", "error")
    }[]
  ): Promise<void> {
    await ensureDBInitialized();
    const db = getDBInstance();
    if (!db) return;
  
    const tx = db.transaction(DESCRIPTIONS_STORE, "readwrite");
    const store = tx.objectStore(DESCRIPTIONS_STORE);
  
    for (const desc of descriptions) {
      await store.put(desc);
    }
    console.log(
      `Saved ${descriptions.length} description(s) to "${DESCRIPTIONS_STORE}".`
    );
  }
  
  /**
   * Get descriptions from DESCRIPTIONS_STORE.
   * If limit=0, returns all.
   */
  export async function getDescriptions(limit: number = 0): Promise<any[]> {
    await ensureDBInitialized();
    const db = getDBInstance();
    if (!db) return [];
  
    const tx = db.transaction(DESCRIPTIONS_STORE, "readonly");
    const store = tx.objectStore(DESCRIPTIONS_STORE);
  
    const results: any[] = [];
    let cursor = await store.openCursor();
    let count = 0;
  
    while (cursor) {
      results.push(cursor.value);
      count++;
      if (limit > 0 && count >= limit) {
        break;
      }
      cursor = await cursor.continue();
    }
    return results;
  }
  