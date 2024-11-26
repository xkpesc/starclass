/*
========================================
File: GithubAuth.ts
========================================
*/


// TODO: Rename this file to GHTokenManager.ts
// GitHub OAuth configuration and authentication
import { Octokit } from "@octokit/core";

let githubToken: string = "";
let octokit: Octokit;

export function saveToken(token: string): void {
    if (token) {
        localStorage.setItem("github_token", token);
        console.log("GitHub token saved to local storage.");
        githubToken = token;  // Update the local `githubToken` variable.
        octokit = new Octokit({ auth: token });
    } else {
        console.error("No token provided to save.");
    }
}
export function initializeOctokit(): void {
    githubToken = localStorage.getItem("github_token") || "";
    if (githubToken) {
        octokit = new Octokit({ auth: githubToken });
    }
}

export function getTokenFromLocalStorage(): string {
    return localStorage.getItem("github_token") || "";
}

export function getOctokitInstance(): Octokit {
    if (!octokit) {
        console.log("Octokit instance not initialized. Attempting to retrieve token from local storage...");
        const token = getTokenFromLocalStorage();
        if (token) {
            octokit = new Octokit({ auth: token });
            console.log("Octokit instance successfully initialized from local storage token.");
        } else {
            throw new Error("Octokit instance is not initialized and no valid token found. Please save a token first.");
        }
    }
    return octokit;
}

/*
========================================
End of File: GithubAuth.ts
========================================
*/
