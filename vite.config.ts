import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'frame-src': ['none'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'script-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'manifest-src': ['self']
				}
			}
		})
	],
	server: {
		port: 43123,
		host: '0.0.0.0',
		strictPort: true
	}
});
