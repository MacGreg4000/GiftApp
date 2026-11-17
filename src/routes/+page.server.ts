import { fail, redirect } from '@sveltejs/kit';
import { loginWithPin } from '#lib/server/auth/login';
import { applySessionCookie } from '#lib/server/auth/session';
import { getConfig } from '#lib/server/config';
import { requestIp } from '#lib/server/http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.user) redirect(303, '/accueil');
	return {
		remembered: cookies.get('ns_prenom') ?? '',
		adminPath: getConfig().adminPath
	};
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const prenom = String(data.get('prenom') ?? '');
		const joined = [0, 1, 2, 3, 4, 5].map((index) => String(data.get('c' + index) ?? '')).join('');
		const code = String(data.get('code') ?? '') || joined;
		const result = await loginWithPin({
			loginName: prenom,
			pin: code,
			ip: requestIp(event),
			userAgent: event.request.headers.get('user-agent')
		});
		if (!result.ok) return fail(401, { message: result.message, prenom });
		const secure = event.url.protocol === 'https:';
		applySessionCookie(event.cookies, result.token, secure, 180 * 24 * 60 * 60);
		event.cookies.set('ns_prenom', result.user.displayName, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			secure,
			maxAge: 180 * 24 * 60 * 60
		});
		redirect(303, '/accueil');
	}
};
