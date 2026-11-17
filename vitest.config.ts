import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'#lib': path.resolve('./src/lib')
		}
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
