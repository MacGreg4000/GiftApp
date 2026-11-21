import { fail, redirect } from '@sveltejs/kit';
import { loginWithPin } from '#lib/server/auth/login';
import { applySessionCookie } from '#lib/server/auth/session';
import { getConfig } from '#lib/server/config';
import { requestIp } from '#lib/server/http';
import { getDb } from '#lib/server/db/client';
import { appUser } from '#lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.user) redirect(303, '/accueil');
	// Liste publique volontaire : la protection repose sur le blocage par compte et par IP.
	const members = await getDb()
		.select({ loginName: appUser.loginName, displayName: appUser.displayName })
		.from(appUser)
		.where(eq(appUser.isActive, true))
		.orderBy(asc(appUser.displayName));
	return {
		members,
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
		// Diagnostic : longueur seulement, jamais les chiffres.
		console.info('[login]', {
			prenomLen: prenom.length,
			codeLen: code.replace(/\D/g, '').length,
			rawLen: code.length,
			cases: [0, 1, 2, 3, 4, 5].map((i) => String(data.get('c' + i) ?? '').length).join('')
		});
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
