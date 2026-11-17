import { fail, redirect } from '@sveltejs/kit';
import { cancelReservation, markPurchased, mySpace } from '#lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const space = await mySpace(locals.user.id);
	return { name: locals.user.displayName, ...space };
};

export const actions: Actions = {
	cancel: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await cancelReservation(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, '/souhaits');
	},
	bought: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await markPurchased(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, '/souhaits');
	}
};
