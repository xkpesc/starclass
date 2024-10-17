// generate_description.js

import { Ollama } from 'ollama';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from a .env file
dotenv.config();

// Initialize Ollama client with host address from environment variables or use the default localhost
const ollama = new Ollama({
  host: process.env.OLLAMA_API_URL || 'http://localhost:11434',
});

// Define the LLM prompt template
// This prompt asks for a brief description of a GitHub repository README and extracts keywords in JSON format
const PROMPT_TEMPLATE = `
You are a helpful assistant that summarizes GitHub repository READMEs.

Given the following README content, provide a brief description (1-2 sentences) of what the repository does. Also, extract 3-5 relevant keywords or tags that best represent the repository's functionality. Respond using JSON format with the following fields:

{
  "brief_description": "<brief description>",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

README:
---
{README_CONTENT}
---
`;

// Function to generate brief description and keywords from README content
export async function generateBriefDescription(readmeContent, model) {
  // Replace placeholder in the prompt template with the actual README content
  const prompt = PROMPT_TEMPLATE.replace('{README_CONTENT}', readmeContent);

  try {
    // Call the Ollama API to generate a response based on the prompt
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
      maxTokens: 150, // Limit the number of tokens in the response to control output length
      format: 'json', // Request the response in JSON format
      stream: false,  // Disable streaming
    });
    console.log(response);

    // Check if the response object and its 'response' property exist
    if (!response || !response.response) {
      throw new Error('Invalid response format from Ollama API');
    }

    // Parse the response to JSON
    const output = JSON.parse(response.response);

    // Extract the brief description and keywords from the parsed JSON
    const briefDescription = output.brief_description || null;
    const keywords = output.keywords || [];

    // Return the brief description and keywords
    return { briefDescription, keywords };
  } catch (error) {
    // Log any errors that occur during the process
    console.error('Error generating brief description:', error);
    return { briefDescription: null, keywords: [] };
  }
}
