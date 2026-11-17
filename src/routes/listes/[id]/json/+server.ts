import { error, json } from '@sveltejs/kit';
import { wishesPayload } from '#lib/server/lists';
import type { Viewer } from '#lib/server/secrecy/dto';
import type { RequestHandler } from './$types';

function viewerOf(locals: App.Locals): Viewer | null {
	if (locals.isAdmin) return { role: 'admin' };
	if (locals.user) return { role: 'member', userId: locals.user.id };
	return null;
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = viewerOf(locals);
	if (!viewer) error(401, 'Connexion requise.');
	const body = await wishesPayload(params.id, viewer);
	if (!body) error(404, 'Cette liste est introuvable.');
	return json(body);
};
