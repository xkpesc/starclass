import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), purgeCss()],
	ssr: {
		noExternal: ["chart.js/auto"]
	},
	server: {
		fs: {
			allow:[
				searchForWorkspaceRoot(process.cwd()),
				]
			}
	}
});