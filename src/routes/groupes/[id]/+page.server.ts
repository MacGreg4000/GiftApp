import { error, redirect } from '@sveltejs/kit';
import { groupForMember } from '#lib/server/groups';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/');
	const group = await groupForMember(locals.user.id, params.id);
	if (!group) error(404, 'Ce groupe est introuvable.');
	return { group };
};
