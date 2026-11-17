import { error } from '@sveltejs/kit';
import { readPhoto } from '#lib/server/photos';
import type { RequestHandler } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user && !locals.isAdmin) error(401, 'Connexion requise.');
	if (!UUID_RE.test(params.id)) error(404, 'Photo introuvable.');
	const viewer = locals.isAdmin
		? ({ role: 'admin' } as const)
		: ({ role: 'member', userId: locals.user!.id } as const);
	const file = await readPhoto(params.id, viewer, url.searchParams.get('taille') === 'mini');
	if (!file) error(404, 'Photo introuvable.');
	return new Response(new Uint8Array(file.bytes), {
		headers: {
			'Content-Type': 'image/webp',
			'Cache-Control': 'private, max-age=86400',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
