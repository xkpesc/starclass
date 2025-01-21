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

- Use octokit to get the root file list of each repo and find the Readme file (instead of using hardcoded ones)

- Migrate to https://github.com/mlc-ai/web-llm ?


# RESOURCES:

libSQL vector db: https://github.com/tursodatabase/libsql-client-ts/tree/main/examples/vector


browser-local LLMS:
https://github.com/huggingface/transformers.js
https://github.com/mlc-ai/web-llm


# MLC-AI dependencies
Web-llm for inferece on web-gpu works! But mlc-ai libraries on npmjs.com are outdated and
installing them from a github url doesn't quite work because the `package.json` is in a subdir.
I've tried using `pnpm` and which supports subdirectories on git urls, but it also has it's problems,
pnpm would work like a charm if it actually used git to fetch the dependency packages, 
but no matter how you specify the git url with git+ssh, git+https, etc prefixes, it always try to
resolve to a codeload.github.com url[...].tar.gz, which doesn't contain git information (the .git folder),
there's maybe a workaround if one would use a private github repo with "git+ssh" or other git hosting 
service that doesn't support packing the repo contents to a tar.gz file (like maybe a gitea selfhosted) but
is far from an elegant solution.
There seems to be two (or three) ways to solve this:
- restructure the mlc-ai repos by moving package.json files to their root, this way we can use npm, which 
actually clones the repo, instead of fetching a tarball like pnpm
- try to patch pnpm so it would always make a shallow clone from repos with git+ssh, or other pnpm option
that would force git dependencies to be retrieved by git clone and not by tarball (cons: need to implement
and wait for merge on the pnpm codebase): check isSsh() part on the typescript source code of pnpm, there's
a regression/bug on the code that never evaluates git+ssh to use cloning, it will always resort to tarballs
- run everything local with bash scripts to handle everything (faster but way less dynamic and not a best practice)














