# TODO:

- Add static Svelte based UI (init svelte project) with: https://svelte.dev/docs/kit/adapter-static

- Add github app for easier auth:
    - Github app user auth works fine (can use web flow or device flow) BUT the token generation step is broken on Single-Page-Apps and possibly on PWAs due to issues with CORS and it seems there's no fix in sight: https://github.com/isaacs/github/issues/330
    - The alternative while keeping everything self-contained in the single-page app, is to each user to generate a fine-grained access token manually with Read-Only (write is really not necessary) on: https://github.com/settings/tokens?type=beta 
    - The other alternative would be to use a serverless function with a proxy so we can avoid the CORS issue: https://github.com/prose/gatekeeper

- Integrate with dumpstar.

- chromium extension maybe?

- Try using trpc streams? Not needed, gonna make it 100% static! Maybe if future OpenAI compatible API is used.

- Deploy to github pages.

- Migrate to svelte5, since it was needed to downgrade to svelte4 because of skeleton TreeViews: https://github.com/skeletonlabs/skeleton/issues/2502

- Svelte + CSP: https://svelte.dev/docs/kit/configuration#csp




# RESOURCES:

libSQL vector db: https://github.com/tursodatabase/libsql-client-ts/tree/main/examples/vector


browser-local LLMS:
https://github.com/huggingface/transformers.js
https://github.com/mlc-ai/web-llm