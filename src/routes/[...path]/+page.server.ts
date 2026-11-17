import { error, fail, redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import {
	addMember,
	archiveGroup,
	createGroup,
	deleteGroup,
	groupStats,
	regeneratePin,
	removeMember,
	reservationsForGroup,
	unlockMember,
	updateGroup,
	updateMember
} from '#lib/server/admin/manage';
import { verifyAdminStepUp, loginAdmin } from '#lib/server/auth/login';
import { applySessionCookie, listUserSessions, revokeSession } from '#lib/server/auth/session';
import { latestBackup } from '#lib/server/backup';
import { getConfig } from '#lib/server/config';
import { getDb } from '#lib/server/db/client';
import { appGroup, appUser, auditLog, groupMember } from '#lib/server/db/schema';
import { requestIp } from '#lib/server/http';
import type { Actions, PageServerLoad } from './$types';

const ADMIN_SECTIONS = ['', 'journal', 'parametres', 'listes', 'sauvegardes'] as const;
type AdminSection = (typeof ADMIN_SECTIONS)[number];

function adminSection(pathname: string): { sub: AdminSection; adminPath: string } | null {
	const config = getConfig();
	const normalized = pathname.replace(/\/+$/, '') || '/';
	if (normalized !== config.adminPath && !normalized.startsWith(config.adminPath + '/')) return null;
	const sub = normalized.slice(config.adminPath.length).replace(/^\//, '');
	if (!ADMIN_SECTIONS.includes(sub as AdminSection)) return null;
	return { sub: sub as AdminSection, adminPath: config.adminPath };
}

async function requireAdmin(locals: App.Locals) {
	if (!locals.isAdmin) return fail(403, { message: 'Connexion administrateur requise.' });
	return null;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const section = adminSection('/' + (params.path ?? ''));
	if (!section) error(404, 'Page introuvable');
	if (!locals.isAdmin) {
		return { mode: 'login' as const, adminPath: section.adminPath, section: section.sub };
	}
	const groups = await getDb()
		.select()
		.from(appGroup)
		.orderBy(appGroup.archivedAt, appGroup.name);
	const requested = url.searchParams.get('g');
	const current = groups.find((group) => group.id === requested) ?? groups.find((group) => !group.archivedAt) ?? groups[0] ?? null;
	const members = current
		? await getDb()
				.select({
					id: appUser.id,
					displayName: appUser.displayName,
					loginName: appUser.loginName,
					label: groupMember.label,
					isActive: appUser.isActive,
					lastLoginAt: appUser.lastLoginAt,
					lockLevel: appUser.lockLevel,
					lockedUntil: appUser.lockedUntil,
					failedPinCount: appUser.failedPinCount
				})
				.from(groupMember)
				.innerJoin(appUser, eq(appUser.id, groupMember.userId))
				.where(eq(groupMember.groupId, current.id))
				.orderBy(appUser.displayName)
		: [];
	const sessions = [];
	for (const member of members) {
		const rows = await listUserSessions(member.id);
		sessions.push(
			...rows.map((row) => ({
				userId: member.id,
				lastSeenAt: row.lastSeenAt,
				createdAt: row.createdAt,
				ip: row.ip,
				userAgent: row.userAgent,
				token: row.tokenHash.toString('hex')
			}))
		);
	}
	const stats = current ? await groupStats(current.id) : null;
	const taken = current ? await reservationsForGroup(current.id) : [];
	const journal =
		section.sub === 'journal'
			? await getDb().select().from(auditLog).orderBy(desc(auditLog.at)).limit(200)
			: [];
	const backup = latestBackup(getConfig().backupDir);
	return {
		mode: 'app' as const,
		adminPath: section.adminPath,
		section: section.sub,
		username: locals.adminUsername,
		groups,
		current,
		members,
		sessions,
		stats,
		taken,
		journal,
		backup: backup
			? { file: backup.file.split('/').slice(-2).join('/'), mtime: backup.mtime.toISOString(), stale: backup.stale }
			: null,
		usingDevSecrets: getConfig().usingDevSecrets
	};
};

export const actions: Actions = {
	login: async (event) => {
		const section = adminSection(event.url.pathname);
		if (!section) error(404, 'Page introuvable');
		const data = await event.request.formData();
		const result = await loginAdmin({
			username: String(data.get('username') ?? ''),
			password: String(data.get('password') ?? ''),
			code: String(data.get('code') ?? ''),
			ip: requestIp(event),
			userAgent: event.request.headers.get('user-agent')
		});
		if (!result.ok) return fail(401, { message: result.message });
		applySessionCookie(event.cookies, result.token, event.url.protocol === 'https:', 12 * 60 * 60);
		redirect(303, section.adminPath);
	},
	createGroup: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		const result = await createGroup({
			name: String(data.get('name') ?? ''),
			description: String(data.get('description') ?? ''),
			accent: String(data.get('accent') ?? 'brique')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `${getConfig().adminPath}?g=${result.id}`);
	},
	updateGroup: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		const result = await updateGroup({
			id: String(data.get('id') ?? ''),
			name: String(data.get('name') ?? ''),
			description: String(data.get('description') ?? ''),
			accent: String(data.get('accent') ?? 'brique')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `${getConfig().adminPath}?g=${data.get('id')}`);
	},
	archiveGroup: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		await archiveGroup(String(data.get('id') ?? ''), data.get('archived') === '1');
		redirect(303, `${getConfig().adminPath}?g=${data.get('id')}`);
	},
	deleteGroup: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		if (!(await verifyAdminStepUp(String(data.get('totp') ?? '')))) {
			return fail(401, { message: 'Code d’authentification incorrect.' });
		}
		const id = String(data.get('id') ?? '');
		const rows = await getDb().select({ name: appGroup.name }).from(appGroup).where(eq(appGroup.id, id)).limit(1);
		if (rows[0]?.name !== String(data.get('confirm') ?? '')) {
			return fail(400, { message: 'Le nom du groupe ne correspond pas.' });
		}
		await deleteGroup(id);
		redirect(303, getConfig().adminPath);
	},
	addMember: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		const result = await addMember({
			groupId: String(data.get('groupId') ?? ''),
			displayName: String(data.get('displayName') ?? ''),
			loginName: String(data.get('loginName') ?? ''),
			label: String(data.get('label') ?? '')
		});
		if (!result.ok) return fail(400, { message: result.message });
		return {
			pin: result.pin,
			displayName: result.displayName,
			loginName: result.loginName,
			attached: result.attached,
			message: result.attached
				? `${result.displayName} est déjà connu·e : ajout au groupe, le code actuel reste valable.`
				: null
		};
	},
	updateMember: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		const result = await updateMember({
			userId: String(data.get('userId') ?? ''),
			groupId: String(data.get('groupId') ?? ''),
			displayName: String(data.get('displayName') ?? ''),
			loginName: String(data.get('loginName') ?? ''),
			label: String(data.get('label') ?? ''),
			isActive: data.get('isActive') === '1'
		});
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Membre mis à jour.' };
	},
	regeneratePin: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		if (!(await verifyAdminStepUp(String(data.get('totp') ?? '')))) {
			return fail(401, { message: 'Code d’authentification incorrect.' });
		}
		const result = await regeneratePin(String(data.get('userId') ?? ''));
		return { pin: result.pin, displayName: result.displayName, loginName: result.loginName, attached: false };
	},
	unlockMember: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		await unlockMember(String(data.get('userId') ?? ''));
		return { message: 'Compte débloqué.' };
	},
	removeMember: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		await removeMember(String(data.get('groupId') ?? ''), String(data.get('userId') ?? ''));
		return { message: 'Membre retiré du groupe.' };
	},
	revokeSession: async (event) => {
		const denied = await requireAdmin(event.locals);
		if (denied) return denied;
		const data = await event.request.formData();
		const hex = String(data.get('token') ?? '');
		if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return fail(400, { message: 'Session inconnue.' });
		await revokeSession(Buffer.from(hex, 'hex'));
		const userId = String(data.get('userId') ?? '');
		const { audit } = await import('#lib/server/auth/audit');
		await audit({ actor: 'admin', action: 'session.revoke', targetId: userId || null });
		return { message: 'Appareil déconnecté.' };
	}
};
