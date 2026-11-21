import { fail, redirect } from '@sveltejs/kit';
import { applySessionCookie } from '#lib/server/auth/session';
import { getConfig } from '#lib/server/config';
import { requestIp } from '#lib/server/http';
import { beginSetup, confirmTotp, finishSetup, setupPhase, totpSetupView } from '#lib/server/setup';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const phase = await setupPhase();
	if (phase === 'ready') redirect(303, getConfig().adminPath);
	if (phase === 'totp') {
		const view = await totpSetupView();
		return { step: 'totp' as const, username: view?.username ?? '', qr: view?.qr ?? '', secret: view?.secret ?? '' };
	}
	return { step: 'account' as const };
};

export const actions: Actions = {
	account: async ({ request }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');
		if (password !== confirm) return fail(400, { message: 'Les deux phrases de passe ne correspondent pas.' });
		const result = await beginSetup({
			username: String(data.get('username') ?? ''),
			password,
			setupCode: String(data.get('setupCode') ?? '')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, '/installation');
	},
	confirm: async ({ request }) => {
		const data = await request.formData();
		const result = await confirmTotp(String(data.get('code') ?? ''));
		if (!result.ok) return fail(400, { message: result.message, step: 'totp' });
		return { codes: result.codes };
	},
	finish: async (event) => {
		const result = await finishSetup({
			ip: requestIp(event),
			userAgent: event.request.headers.get('user-agent')
		});
		if (!result.ok) return fail(400, { message: result.message });
		applySessionCookie(event.cookies, result.token, event.url.protocol === 'https:', 12 * 60 * 60);
		redirect(303, getConfig().adminPath);
	}
};
