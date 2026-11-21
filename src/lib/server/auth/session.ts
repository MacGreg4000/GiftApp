import { and, eq, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '../db/client';
import { appUser, session } from '../db/schema';
import { newSessionToken } from './crypto';

export const MEMBER_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
export const STEP_UP_MS = 10 * 60 * 1000;

export function stepUpFresh(until: Date | null | undefined, now = new Date()): boolean {
	return Boolean(until && until.getTime() > now.getTime());
}

export function sessionCookieName(secure: boolean): string {
	return secure ? '__Host-session' : 'ns_session';
}

export async function createSession(input: {
	userId: string | null;
	isAdmin: boolean;
	ip: string | null;
	userAgent: string | null;
	now?: Date;
}): Promise<string> {
	const now = input.now ?? new Date();
	const { token, tokenHash } = newSessionToken();
	const ttl = input.isAdmin ? ADMIN_TTL_MS : MEMBER_TTL_MS;
	await getDb().insert(session).values({
		tokenHash,
		userId: input.isAdmin ? null : input.userId,
		isAdmin: input.isAdmin,
		createdAt: now,
		lastSeenAt: now,
		expiresAt: new Date(now.getTime() + ttl),
		ip: input.ip,
		userAgent: input.userAgent?.slice(0, 300) ?? null,
		stepUpUntil: input.isAdmin ? new Date(now.getTime() + STEP_UP_MS) : null
	});
	return token;
}

export async function markStepUp(tokenHash: Buffer, now = new Date()): Promise<Date> {
	const until = new Date(now.getTime() + STEP_UP_MS);
	await getDb().update(session).set({ stepUpUntil: until }).where(eq(session.tokenHash, tokenHash));
	return until;
}

export async function readSession(token: string, now = new Date()) {
	const { sha256 } = await import('./crypto');
	const tokenHash = sha256(token);
	const rows = await getDb().select().from(session).where(eq(session.tokenHash, tokenHash)).limit(1);
	const row = rows[0];
	if (!row) return null;
	if (row.expiresAt.getTime() <= now.getTime()) {
		await getDb().delete(session).where(eq(session.tokenHash, tokenHash));
		return null;
	}
	if (row.isAdmin) {
		const idle = now.getTime() - row.lastSeenAt.getTime();
		const absolute = now.getTime() - row.createdAt.getTime();
		if (idle > ADMIN_IDLE_MS || absolute > ADMIN_TTL_MS) {
			await getDb().delete(session).where(eq(session.tokenHash, tokenHash));
			return null;
		}
	}
	const seenAgo = now.getTime() - row.lastSeenAt.getTime();
	if (seenAgo > 5 * 60 * 1000) {
		const patch: { lastSeenAt: Date; expiresAt?: Date } = { lastSeenAt: now };
		if (!row.isAdmin && seenAgo > 60 * 60 * 1000) {
			patch.expiresAt = new Date(now.getTime() + MEMBER_TTL_MS);
		}
		await getDb().update(session).set(patch).where(eq(session.tokenHash, tokenHash));
		row.lastSeenAt = now;
		if (patch.expiresAt) row.expiresAt = patch.expiresAt;
	}
	return { ...row, tokenHash };
}

export async function revokeSession(tokenHash: Buffer) {
	await getDb().delete(session).where(eq(session.tokenHash, tokenHash));
}

export async function revokeUserSessions(userId: string) {
	await getDb().delete(session).where(eq(session.userId, userId));
}

export function applySessionCookie(cookies: Cookies, token: string, secure: boolean, maxAgeSeconds: number) {
	const name = sessionCookieName(secure);
	const other = sessionCookieName(!secure);
	cookies.delete(other, { path: '/' });
	cookies.set(name, token, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: maxAgeSeconds
	});
}

export function clearSessionCookies(cookies: Cookies) {
	cookies.delete('__Host-session', { path: '/', secure: true });
	cookies.delete('ns_session', { path: '/' });
}

export function readSessionCookie(cookies: Cookies): string | null {
	return cookies.get('__Host-session') || cookies.get('ns_session') || null;
}

export async function cleanupExpired(now = new Date()) {
	await getDb().delete(session).where(lt(session.expiresAt, now));
	await getDb()
		.delete(session)
		.where(and(eq(session.isAdmin, true), lt(session.createdAt, new Date(now.getTime() - ADMIN_TTL_MS))));
}

export async function listUserSessions(userId: string) {
	return getDb()
		.select({
			tokenHash: session.tokenHash,
			createdAt: session.createdAt,
			lastSeenAt: session.lastSeenAt,
			ip: session.ip,
			userAgent: session.userAgent
		})
		.from(session)
		.where(and(eq(session.userId, userId), eq(session.isAdmin, false)));
}

export async function loadActiveUser(userId: string) {
	const rows = await getDb()
		.select({
			id: appUser.id,
			displayName: appUser.displayName,
			loginName: appUser.loginName,
			isActive: appUser.isActive
		})
		.from(appUser)
		.where(and(eq(appUser.id, userId), eq(appUser.isActive, true)))
		.limit(1);
	return rows[0] ?? null;
}
