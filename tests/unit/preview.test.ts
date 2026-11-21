import { describe, expect, it } from 'vitest';
import { readOpenGraph } from '#lib/server/preview';
import { siteDomain } from '#lib/domain';

describe('aperçu de lien', () => {
	it('lit le titre OpenGraph et le domaine', () => {
		const html = `<html><head>
			<meta property="og:site_name" content="Librairie &amp; Cie">
			<meta content="Le grand livre" property="og:title">
			<meta property="og:image" content="https://cdn.exemple.be/a.jpg">
			<title>Ignoré</title>
		</head></html>`;
		expect(readOpenGraph(html)).toEqual({
			title: 'Le grand livre',
			siteName: 'Librairie & Cie',
			image: 'https://cdn.exemple.be/a.jpg'
		});
		expect(siteDomain('https://www.exemple.be/chemin')).toBe('exemple.be');
	});
});
