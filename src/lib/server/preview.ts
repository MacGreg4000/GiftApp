import { FetchBlocked, safeGet } from './net/ssrf';
import { PhotoError, storeImage } from './photos';

export type LinkPreviewDraft = {
	title: string | null;
	siteName: string | null;
	photoId: string | null;
};

function decodeEntities(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d{1,6});/g, (_, digits: string) => {
			const code = Number(digits);
			if (code < 32 || code > 0x10ffff) return '';
			return String.fromCodePoint(code);
		})
		.replace(/\s+/g, ' ')
		.trim();
}

export function readOpenGraph(html: string): { title: string | null; siteName: string | null; image: string | null } {
	const slice = html.slice(0, 200_000);
	const pick = (key: string): string | null => {
		const patterns = [
			new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
			new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i')
		];
		for (const pattern of patterns) {
			const found = pattern.exec(slice);
			if (found?.[1]) return decodeEntities(found[1]).slice(0, 300) || null;
		}
		return null;
	};
	let title = pick('og:title');
	if (!title) {
		const found = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(slice);
		title = found?.[1] ? decodeEntities(found[1]).slice(0, 200) : null;
	}
	return { title, siteName: pick('og:site_name'), image: pick('og:image') };
}

export async function fetchLinkPreview(rawUrl: string, userId: string): Promise<LinkPreviewDraft> {
	const page = await safeGet(rawUrl);
	if (page.status >= 400) throw new FetchBlocked('La page ne répond pas');
	const og = readOpenGraph(page.body.toString('utf8'));
	let photoId: string | null = null;
	if (og.image) {
		try {
			const absolute = new URL(og.image, page.finalUrl).toString();
			const file = await safeGet(absolute);
			if (file.status < 400 && /^image\//i.test(file.contentType) && file.body.length > 32) {
				const stored = await storeImage(file.body, 'link_preview', userId);
				photoId = stored.id;
			}
		} catch (error) {
			if (!(error instanceof FetchBlocked) && !(error instanceof PhotoError)) {
				/* l’aperçu image est facultatif */
			}
			photoId = null;
		}
	}
	return {
		title: og.title ? og.title.slice(0, 200) : null,
		siteName: og.siteName ? og.siteName.slice(0, 80) : null,
		photoId
	};
}
