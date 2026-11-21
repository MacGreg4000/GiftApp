import { redirect } from '@sveltejs/kit';
import { clearSessionCookies, revokeSession } from '#lib/server/auth/session';
import { getConfig } from '#lib/server/config';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		const admin = locals.isAdmin;
		if (locals.sessionHash) await revokeSession(locals.sessionHash);
		clearSessionCookies(cookies);
		redirect(303, admin ? getConfig().adminPath : '/');
	}
};
