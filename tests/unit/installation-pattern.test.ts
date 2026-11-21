import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

function svelteFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...svelteFiles(path));
		else if (entry.name.endsWith('.svelte')) found.push(path);
	}
	return found;
}

describe('accolades littérales dans les attributs', () => {
	it('ne laisse aucun quantificateur {n} dans un attribut entre guillemets', () => {
		const offenders: string[] = [];
		const suspect = /=\s*(?:"[^"]*\{\d+\}[^"]*"|'[^']*\{\d+\}[^']*')/;
		for (const file of svelteFiles(join(process.cwd(), 'src'))) {
			const source = readFileSync(file, 'utf8');
			if (suspect.test(source)) offenders.push(file);
		}
		expect(offenders).toEqual([]);
	});

	it('rend le motif TOTP [0-9]{6} dans le HTML', async () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/installation/+page.svelte'), 'utf8');
		const { js } = compile(source, {
			filename: 'installation/+page.svelte',
			generate: 'server',
			css: 'external'
		});
		const dir = join(process.cwd(), 'node_modules/.cache/installation-render');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'forms.js'), 'export function enhance() { return { destroy() {} }; }\n');
		writeFileSync(join(dir, 'page.js'), js.code.replace("from '$app/forms'", "from './forms.js'"));
		const mod = await import(pathToFileURL(join(dir, 'page.js')).href + `?t=${Date.now()}`);
		const { body } = render(mod.default, {
			props: { data: { step: 'totp', qr: '', secret: 'ABC' }, form: null }
		});
		expect(body).toContain('pattern="[0-9]{6}"');
		expect(body).not.toContain('pattern="[0-9]6"');
	});
});
