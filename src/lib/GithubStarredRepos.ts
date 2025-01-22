/*
========================================
File: GithubStarredRepos.ts
========================================
Purpose:
  - Handle GitHub + Octokit calls
  - Provide high-level logic for fetching repos, readmes, etc.
  - Rely on IDBUtils.ts for IndexedDB interactions
*/

import { getOctokitInstance } from "./GithubAuth"; // or wherever your GitHub auth is
import {
  loadStarredReposFromDB,
  saveStarredReposToDB,
  saveReadmeToDB,
  updateRepoWithReadmeFilename
} from "./IDBUtils";

const possiblePaths: string[] = [
  "README.md",
  "README",
  "readme.md",
  "readme",
  "Readme.md"
];

/**
 * Fetch the timestamp of the latest starred repo from local DB
 * to know where to resume GitHub fetching.
 */
async function getLastStarredRepo(): Promise<string | null> {
  const repos = await loadStarredReposFromDB();
  if (repos.length > 0) {
    const sortedRepos = repos.sort(
      (a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime()
    );
    return sortedRepos[0].starred_at;
  }
  return null;
}

/**
 * Generator function to retrieve starred repos from GitHub
 * and store them in IndexedDB, page by page.
 */
export async function* getStarredRepos(
  page: number = 1,
  page_end: number = -1,
  abortController?: AbortController
): AsyncGenerator<{ status: string; repos?: any[] }, void, unknown> {
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
        page,
        sort: "created",
        direction: "desc",
        headers: {
          accept: "application/vnd.github.star+json"
        }
      });

      const repos = response.data.map((repo: any) => ({
        id: repo.repo.id,
        full_name: repo.repo.full_name,
        description: repo.repo.description,
        url: repo.repo.html_url,
        starred_at: repo.starred_at,
        language: repo.repo.language,
        github_readme_filename: null,
        selected: true
      }));
      yield { status: `Page ${page}: fetched ${repos.length} repos`, repos };

      // Stop if we have already fetched these before
      if (stopAt && repos.some((r: any) => new Date(r.starred_at) <= new Date(stopAt))) {
        yield { status: "All new repos are up-to-date." };
        return;
      }

      // Save them in IndexedDB
      await saveStarredReposToDB(repos);

      // If fewer than 100 returned, or we reached page_end, stop
      if (repos.length < 100 || (page_end !== -1 && page >= page_end)) {
        return;
      }

      page++;
    }
  } catch (error: any) {
    yield { status: `Error fetching starred repositories: ${error}` };
  }
}

/**
 * Attempt to fetch README from GitHub using known possible file paths
 */
async function fetchReadmeWithFileName(
  owner: string,
  repo: string
): Promise<{ content: string | null; originalReadmeName: string | null }> {
  const octokit = getOctokitInstance();

  for (const filePath of possiblePaths) {
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: filePath,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (response.status === 200 && response.data.content) {
        // atob decode the base64-encoded content
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

/**
 * Generator function to process readmes for a set of repos.
 *  - fetch from GitHub
 *  - save to IDB
 */
export async function* processReadmes(
  repos: any[],
  abortController?: AbortController
): AsyncGenerator<{ status: string; fetched?: number; total?: number }, void, unknown> {
  const existingRepos = await loadStarredReposFromDB();
  const existingRepoMap = new Map(existingRepos.map((r) => [r.id, r]));

  let fetched = 0;
  const total = repos.length;

  for (const repo of repos) {
    if (abortController?.signal.aborted) {
      yield { status: "Operation aborted by user.", fetched, total };
      return;
    }

    const [owner, repoName] = repo.full_name.split("/");

    // Skip if we already have a README filename or false (meaning tried and not found)
    if (existingRepoMap.has(repo.id) && existingRepoMap.get(repo.id).github_readme_filename !== null) {
      yield { status: `Skipping ${repo.full_name} as README is already processed.`, fetched, total };
      continue;
    }

    const { content, originalReadmeName } = await fetchReadmeWithFileName(owner, repoName);
    if (content) {
      // Save readme content to IDB
      await saveReadmeToDB(repo.id, repo.full_name, content);

      // Update that repo's readme filename in the IDB
      await updateRepoWithReadmeFilename(repo.id, originalReadmeName);
    } else {
      // Mark it as "not found"
      await updateRepoWithReadmeFilename(repo.id, false);
    }

    fetched++;
    yield { status: `Processed README for ${repo.full_name}`, fetched, total };
  }

  yield { status: "Processing complete.", fetched, total };
}
