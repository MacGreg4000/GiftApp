import { error, fail, redirect } from '@sveltejs/kit';
import { groupForMember } from '#lib/server/groups';
import { createList } from '#lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/');
	const group = await groupForMember(locals.user.id, params.id);
	if (!group) error(404, 'Ce groupe est introuvable.');
	return { group };
};

export const actions: Actions = {
	createList: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await createList({
			actor: { role: 'member', userId: user.id },
			groupId: event.params.id,
			title: String(data.get('title') ?? ''),
			theme: String(data.get('theme') ?? 'generique'),
			eventDate: String(data.get('eventDate') ?? ''),
			recipientId: String(data.get('recipientId') ?? '')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${result.id}`);
	}
};
