// Import necessary modules
import { Octokit } from "@octokit/core";
import dotenv from 'dotenv'; // Load environment variables from .env
import { generateBriefDescription } from './generate_description.js';

dotenv.config();

// Initialize Octokit instance for GitHub API
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN // Use the token from the .env file
});

async function fetchReadme(owner, repo) {
  const possiblePaths = ['README.md', 'README', 'readme.md', 'readme', 'Readme.md']; // Possible README file names
  
  for (const path of possiblePaths) {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: owner,
        repo: repo,
        path: path,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          accept: 'application/vnd.github.raw+json' // Retrieve raw content
        }
      });

      console.log(`Successfully fetched ${path}:`);
      console.log(response.data); // Print the raw content of the README file
      return response.data; // Return the raw content if the file is found
    } catch (error) {
      if (error.status === 404) {
        console.log(`${path} not found, trying the next one...`);
      } else {
        console.error(`Error fetching ${path}:`, error);
        break; // If another error occurs, stop further execution
      }
    }
  }

  console.log('No README file found in the repository.');
  return null;
}

async function main() {
  // Repository details
  const owner = 'legendsayantan';
  const repo = 'ShizuTools';
  const model = 'llama3.2:3b'; // Define the model to be used by Ollama

  // Fetch README content
  const readmeContent = await fetchReadme(owner, repo);
  if (readmeContent) {
    // Generate brief description and keywords using Ollama API
    const { briefDescription, keywords } = await generateBriefDescription(readmeContent, model);

    if (briefDescription) {
      console.log('\nGenerated Brief Description:');
      console.log(briefDescription);
    } else {
      console.log('Could not generate brief description.');
    }

    if (keywords.length > 0) {
      console.log('\nExtracted Keywords:');
      keywords.forEach((keyword, index) => {
        console.log(`${index + 1}. ${keyword}`);
      });
    } else {
      console.log('No keywords were extracted.');
    }
  }
}

// Execute the main function
main().catch(error => console.error('Unexpected error:', error));