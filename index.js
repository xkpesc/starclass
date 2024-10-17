import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/core';
import dotenv from 'dotenv';
import { generateBriefDescription } from './generate_description.js'; // Import the function


// Load environment variables from .env file
dotenv.config();


if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN is not set in the environment variables.');
    process.exit(1);
}


// Initialize Octokit instance
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

// Constants
const FILE_NAME = 'starred_repos.json';
const README_FOLDER = 'readmes';
const possiblePaths = ['README.md', 'README', 'readme.md', 'readme', 'Readme.md'];

// Load starred repos from JSON file
function loadStarredRepos() {
    if (!fs.existsSync(FILE_NAME)) {
        console.log('No starred_repos.json file found, starting fresh.');
        return [];
    }

    const data = fs.readFileSync(FILE_NAME, 'utf8');
    try {
        return JSON.parse(data);
    } catch (error) {
        console.error('Error parsing starred_repos.json:', error);
        return [];
    }
}

// Save starred repos to JSON file
function saveStarredRepos(repos) {
    let existingRepos = loadStarredRepos();

    // Create a map for quick lookup of existing repo names
    const existingRepoMap = new Map(existingRepos.map(repo => [repo.name, repo]));

    // Add new repos, avoiding duplicates
    for (const repo of repos) {
        if (!existingRepoMap.has(repo.name)) {
            existingRepos.push(repo);
        } else {
            // Optionally update existing repo info if needed
            // For example, you might update the starred_at timestamp
            const existingRepo = existingRepoMap.get(repo.name);
            if (new Date(repo.starred_at) > new Date(existingRepo.starred_at)) {
                Object.assign(existingRepo, repo);
            }
        }
    }

    // Write the updated list to the JSON file
    fs.writeFileSync(FILE_NAME, JSON.stringify(existingRepos, null, 2));
    console.log(`Saved ${repos.length} repos to ${FILE_NAME}`);
}

// Function to get the last starred repo timestamp
function getLastStarredRepo() {
    const repos = loadStarredRepos();
    if (repos.length > 0) {
        // Sort repos by starred_at timestamp to get the most recent one
        const sortedRepos = repos.sort((a, b) => new Date(b.starred_at) - new Date(a.starred_at));
        return sortedRepos[0].starred_at;
    }
    return null;
}

// Function to save README content to a file with owner+reponame format
function saveReadmeToFile(owner, repoName, content) {
    const fileName = `${owner}+${repoName}.md`;
    const filePath = path.join(README_FOLDER, fileName);

    // Ensure readmes folder exists
    if (!fs.existsSync(README_FOLDER)) {
        fs.mkdirSync(README_FOLDER);
    }

    fs.writeFileSync(filePath, content);
    console.log(`Saved README for ${owner}/${repoName} to ${filePath}`);
    return fileName; // Return the relative filename
}

// Function to update the JSON file with the readme filename and github_readme field
function saveStarredReposWithReadme(repos, readmeFiles, githubReadmeNames) {
    let existingRepos = loadStarredRepos();

    // Create a map for quick lookup
    const existingRepoMap = new Map(existingRepos.map(repo => [repo.name, repo]));

    // Update each repo with the corresponding readme file and github_readme status
    for (const repo of repos) {
        const existingRepo = existingRepoMap.get(repo.name);
        if (existingRepo) {
            existingRepo.readme_file = readmeFiles[repo.name] || null;
            existingRepo.github_readme = githubReadmeNames[repo.name] !== null ? githubReadmeNames[repo.name] : false;
        }
    }

    // Write the updated list to the JSON file
    fs.writeFileSync(FILE_NAME, JSON.stringify(existingRepos, null, 2));
    console.log(`Updated ${FILE_NAME} with README information`);
}

// Fetch README or its variations from a repository
async function fetchReadmeWithFileName(owner, repo) {
    for (const filePath of possiblePaths) {
        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner,
                repo,
                path: filePath,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            // If README is found, return its content and original filename
            if (response.status === 200 && response.data.content) {
                const content = Buffer.from(response.data.content, 'base64').toString('utf8');
                return { content, originalReadmeName: filePath };
            }
        } catch (error) {
            // Ignore if README not found, try next path
            if (error.status !== 404) {
                console.error(`Error fetching README for ${owner}/${repo}:`, error);
            }
        }
    }

    return { content: null, originalReadmeName: null };
}

// Process readmes for all repos
async function processReadmes() {
    const repos = loadStarredRepos();
    const readmeFiles = {};
    const githubReadmeNames = {};

    for (const repo of repos) {
        const [owner, repoName] = repo.name.split('/');

        // Skip repos where github_readme is already populated with a valid .md file or marked as not available
        if (repo.github_readme) {
            console.log(`Skipping ${repo.name} as README is already processed.`);
            continue;
        }

        const { content, originalReadmeName } = await fetchReadmeWithFileName(owner, repoName); // Fetch README

        if (content) {
            const savedFileName = saveReadmeToFile(owner, repoName, content);
            readmeFiles[repo.name] = savedFileName; // Store the saved readme filename
            githubReadmeNames[repo.name] = originalReadmeName; // Store the original README filename
        } else {
            githubReadmeNames[repo.name] = false; // Assign false if no README is found
        }
    }

    // Update the JSON file with readme filenames and github_readme field
    saveStarredReposWithReadme(repos, readmeFiles, githubReadmeNames);
}

// Updated main function to handle date comparison and fetching README
async function getStarredRepos(page = 1, stopAt = null) {
    try {
        const response = await octokit.request('GET /user/starred', {
            headers: {
                accept: 'application/vnd.github.v3.star+json',
            },
            per_page: 100,
            page: page,
            sort: 'created',
            direction: 'desc',
        });

        const repos = response.data.map((repo) => ({
            name: repo.repo.full_name,
            description: repo.repo.description,
            url: repo.repo.html_url,
            starred_at: repo.starred_at,
            github_readme: null, // Initialize with null on first download
        }));

        // Proper date-time check
        if (stopAt && repos.some((repo) => new Date(repo.starred_at) <= new Date(stopAt))) {
            console.log('All new repos are up-to-date, stopping further calls.');
            return;
        }

        console.log(`Page ${page}: fetched ${repos.length} repos`);

        saveStarredRepos(repos);

        if (repos.length === 100) {
            const randomDelay = Math.random() * 2000 + 1000; // Random delay between 1-3 seconds
            await new Promise((resolve) => setTimeout(resolve, randomDelay));
            await getStarredRepos(page + 1, stopAt);
        }
    } catch (error) {
        console.error('Error fetching starred repos:', error);
    }
}

// Function to update the JSON file with brief descriptions and model info
async function updateStarredReposWithDescriptions(repos) {
    const model = 'llama3.2:3b';
    let existingRepos = loadStarredRepos();

    for (const repo of repos) {
        const existingRepo = existingRepos.find(r => r.name === repo.name);
        if (existingRepo && existingRepo.readme_file) {
            // Read the README content from the saved file
            const readmePath = path.join(README_FOLDER, existingRepo.readme_file);
            if (fs.existsSync(readmePath)) {
                const readmeContent = fs.readFileSync(readmePath, 'utf8');
                const { briefDescription, keywords } = await generateBriefDescription(readmeContent, model);

                existingRepo.brief_description = briefDescription;
                existingRepo.keywords = keywords;
                existingRepo.model_used = model; // Replace with actual model name
                // console.log(briefDescription)
                // console.log(keywords)
            }
        }
    }

    // Write the updated list to the JSON file
    fs.writeFileSync(FILE_NAME, JSON.stringify(existingRepos, null, 2));
    console.log(`Updated ${FILE_NAME} with brief descriptions.`);
}

(async function main() {
    // const lastStarredAt = getLastStarredRepo();
    // if (lastStarredAt) {
    //     console.log(`Last starred repo timestamp found: ${lastStarredAt}`);
    // } else {
    //     console.log('No previous starred repos found.');
    // }

    // // Fetch starred repos and update the list
    // await getStarredRepos(1, lastStarredAt);

    // // Process readmes after fetching repos
    // await processReadmes();

    // Generate brief descriptions
    await updateStarredReposWithDescriptions(loadStarredRepos());
})();