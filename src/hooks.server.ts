import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { eq, lt } from 'drizzle-orm';
import { getDb } from '#lib/server/db/client';
import { runMigrations } from '#lib/server/db/migrate';
import { adminAccount, loginAttempt } from '#lib/server/db/schema';
import { initAuthHashes } from '#lib/server/auth/login';
import { cleanupExpired, loadActiveUser, readSession, readSessionCookie } from '#lib/server/auth/session';
import { assertProductionSecrets, getConfig } from '#lib/server/config';
import { applySecurityHeaders, isHttps } from '#lib/server/http';
import { ensureSetupToken, isSetupComplete } from '#lib/server/setup';

export const init: ServerInit = async () => {
	assertProductionSecrets();
	await runMigrations();
	await initAuthHashes();
	await cleanupExpired();
	const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	await getDb().delete(loginAttempt).where(lt(loginAttempt.at, cutoff));
	if (!(await isSetupComplete())) await ensureSetupToken();
	const timer = setInterval(() => {
		cleanupExpired().catch((error) => console.error(error));
		import('#lib/server/photos')
			.then((photos) => photos.cleanupOrphanPhotos())
			.catch((error) => console.error(error));
		import('#lib/server/push')
			.then((push) => push.dispatchReminders())
			.catch((error) => console.error(error));
	}, 60 * 60 * 1000);
	timer.unref?.();
	console.log('Nos Souhaits est prêt.');
};

function go(https: boolean, location: string): Response {
	const headers = new Headers({ location });
	applySecurityHeaders(headers, https);
	return new Response(null, { status: 303, headers });
}

function isOpenPath(pathname: string): boolean {
	if (pathname === '/healthz' || pathname === '/robots.txt' || pathname === '/favicon.svg') return true;
	if (pathname === '/manifest.webmanifest' || pathname === '/sw.js') return true;
	if (pathname === '/icon-192.png' || pathname === '/icon-512.png' || pathname === '/apple-touch-icon.png') return true;
	if (pathname.startsWith('/_app/') || pathname.startsWith('/fonts/')) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const config = getConfig();
	event.locals.user = null;
	event.locals.isAdmin = false;
	event.locals.adminUsername = null;
	event.locals.sessionHash = null;
	event.locals.stepUpUntil = null;

	const token = readSessionCookie(event.cookies);
	if (token) {
		const row = await readSession(token);
		if (row?.isAdmin) {
			const admin = await getDb().select({ username: adminAccount.username }).from(adminAccount).limit(1);
			event.locals.isAdmin = true;
			event.locals.adminUsername = admin[0]?.username ?? 'Admin';
			event.locals.sessionHash = row.tokenHash;
			event.locals.stepUpUntil = row.stepUpUntil;
		} else if (row?.userId) {
			const user = await loadActiveUser(row.userId);
			if (user) {
				event.locals.user = {
					id: user.id,
					displayName: user.displayName,
					loginName: user.loginName
				};
				event.locals.sessionHash = row.tokenHash;
			}
		}
	}

	const https = isHttps(event.url);
	if (event.url.pathname === '/favicon.ico') {
		const headers = new Headers({ location: '/favicon.svg' });
		applySecurityHeaders(headers, https);
		return new Response(null, { status: 302, headers });
	}
	const path = event.url.pathname.replace(/\/+$/, '') || '/';
	if (!isOpenPath(event.url.pathname)) {
		const ready = await isSetupComplete();
		if (!ready && path !== '/installation') {
			return go(https, '/installation');
		}
		if (ready && path === '/installation' && event.request.method === 'GET') {
			return go(https, config.adminPath);
		}
	}

	const response = await resolve(event);
	applySecurityHeaders(response.headers, https);
	if (event.url.pathname === '/healthz') {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};

export const handleError: HandleServerError = (input) => {
	console.error(input.error);
	if (input.kind === 'framework' && input.error.status === 404) {
		return { message: 'Page introuvable.' };
	}
	return { message: 'Une erreur est survenue. Réessayez dans un instant.' };
};
