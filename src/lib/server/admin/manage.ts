import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { audit } from '../auth/audit';
import { hashPin } from '../auth/crypto';
import { foldName, generatePin, suggestLoginName } from '../auth/pin';
import { revokeUserSessions } from '../auth/session';
import { getConfig } from '../config';
import { getDb } from '../db/client';
import { appGroup, appUser, groupMember, reservation, wish, wishList } from '../db/schema';

const ACCENTS = new Set(['brique', 'sapin', 'or', 'corail', 'sarcelle', 'soleil']);

export async function createGroup(input: { name: string; description: string; accent: string }) {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 80) return { ok: false as const, message: 'Le nom du groupe doit contenir entre 1 et 80 caractères.' };
	const description = input.description.trim();
	if (description.length > 500) return { ok: false as const, message: 'La description est trop longue.' };
	const accent = ACCENTS.has(input.accent) ? input.accent : 'brique';
	const rows = await getDb()
		.insert(appGroup)
		.values({ name, description: description || null, accent, icon: 'gift' })
		.returning({ id: appGroup.id });
	await audit({ actor: 'admin', action: 'group.create', targetId: rows[0]!.id, details: { name } });
	return { ok: true as const, id: rows[0]!.id };
}

export async function updateGroup(input: {
	id: string;
	name: string;
	description: string;
	accent: string;
}) {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 80) return { ok: false as const, message: 'Le nom du groupe est invalide.' };
	const description = input.description.trim();
	const accent = ACCENTS.has(input.accent) ? input.accent : 'brique';
	await getDb()
		.update(appGroup)
		.set({ name, description: description || null, accent })
		.where(eq(appGroup.id, input.id));
	await audit({ actor: 'admin', action: 'group.update', targetId: input.id, details: { name } });
	return { ok: true as const };
}

export async function archiveGroup(id: string, archived: boolean) {
	await getDb()
		.update(appGroup)
		.set({ archivedAt: archived ? new Date() : null })
		.where(eq(appGroup.id, id));
	await audit({ actor: 'admin', action: archived ? 'group.archive' : 'group.restore', targetId: id });
	return { ok: true as const };
}

export async function deleteGroup(id: string) {
	await getDb().delete(appGroup).where(eq(appGroup.id, id));
	await audit({ actor: 'admin', action: 'group.delete', targetId: id });
	return { ok: true as const };
}

export async function addMember(input: {
	groupId: string;
	displayName: string;
	loginName: string;
	label: string;
}) {
	const displayName = input.displayName.trim();
	if (displayName.length < 1 || displayName.length > 60) {
		return { ok: false as const, message: 'Le prénom doit contenir entre 1 et 60 caractères.' };
	}
	const label = input.label.trim();
	if (label.length > 40) return { ok: false as const, message: 'Le rôle est trop long.' };
	const group = await getDb().select({ id: appGroup.id }).from(appGroup).where(eq(appGroup.id, input.groupId)).limit(1);
	if (!group[0]) return { ok: false as const, message: 'Groupe introuvable.' };

	const takenRows = await getDb().select({ loginName: appUser.loginName }).from(appUser);
	const taken = new Set(takenRows.map((row) => row.loginName));
	let loginName = foldName(input.loginName).replace(/[^a-z0-9._-]/g, '');
	if (!loginName) loginName = suggestLoginName(displayName, taken);
	if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(loginName)) {
		return { ok: false as const, message: 'Le prénom de connexion ne peut contenir que des lettres, chiffres, points et tirets.' };
	}

	const existing = await getDb().select().from(appUser).where(eq(appUser.loginName, loginName)).limit(1);
	if (existing[0]) {
		await getDb()
			.insert(groupMember)
			.values({ groupId: input.groupId, userId: existing[0].id, label: label || null })
			.onConflictDoUpdate({
				target: [groupMember.groupId, groupMember.userId],
				set: { label: label || null }
			});
		await audit({
			actor: 'admin',
			action: 'member.attach',
			targetId: existing[0].id,
			details: { groupId: input.groupId }
		});
		return {
			ok: true as const,
			attached: true,
			displayName: existing[0].displayName,
			loginName: existing[0].loginName,
			pin: null as string | null
		};
	}

	const pin = generatePin();
	const pinHash = await hashPin(pin, getConfig().pinPepper);
	const created = await getDb()
		.insert(appUser)
		.values({ displayName, loginName, pinHash })
		.returning({ id: appUser.id });
	await getDb().insert(groupMember).values({
		groupId: input.groupId,
		userId: created[0]!.id,
		label: label || null
	});
	await audit({
		actor: 'admin',
		action: 'member.create',
		targetId: created[0]!.id,
		details: { loginName, groupId: input.groupId }
	});
	return { ok: true as const, attached: false, displayName, loginName, pin };
}

export async function updateMember(input: {
	userId: string;
	groupId: string;
	displayName: string;
	loginName: string;
	label: string;
	isActive: boolean;
}) {
	const displayName = input.displayName.trim();
	const loginName = foldName(input.loginName).replace(/[^a-z0-9._-]/g, '');
	if (displayName.length < 1 || displayName.length > 60) {
		return { ok: false as const, message: 'Le nom affiché est invalide.' };
	}
	if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(loginName)) {
		return { ok: false as const, message: 'Le prénom de connexion est invalide.' };
	}
	const clash = await getDb().select({ id: appUser.id }).from(appUser).where(eq(appUser.loginName, loginName)).limit(1);
	if (clash[0] && clash[0].id !== input.userId) {
		return { ok: false as const, message: 'Ce prénom de connexion est déjà utilisé.' };
	}
	await getDb()
		.update(appUser)
		.set({ displayName, loginName, isActive: input.isActive })
		.where(eq(appUser.id, input.userId));
	await getDb()
		.update(groupMember)
		.set({ label: input.label.trim() || null })
		.where(and(eq(groupMember.userId, input.userId), eq(groupMember.groupId, input.groupId)));
	if (!input.isActive) await revokeUserSessions(input.userId);
	await audit({ actor: 'admin', action: 'member.update', targetId: input.userId, details: { loginName } });
	return { ok: true as const };
}

export async function regeneratePin(userId: string) {
	const pin = generatePin();
	const pinHash = await hashPin(pin, getConfig().pinPepper);
	await getDb()
		.update(appUser)
		.set({
			pinHash,
			pinSetAt: new Date(),
			failedPinCount: 0,
			lockLevel: 0,
			lockedUntil: null
		})
		.where(eq(appUser.id, userId));
	await revokeUserSessions(userId);
	await getDb().execute(sql`DELETE FROM push_subscription WHERE user_id = ${userId}`);
	await audit({ actor: 'admin', action: 'pin.regenerate', targetId: userId });
	const user = await getDb()
		.select({ displayName: appUser.displayName, loginName: appUser.loginName })
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	return { ok: true as const, pin, displayName: user[0]?.displayName ?? '', loginName: user[0]?.loginName ?? '' };
}

export async function unlockMember(userId: string) {
	await getDb()
		.update(appUser)
		.set({ failedPinCount: 0, lockLevel: 0, lockedUntil: null })
		.where(eq(appUser.id, userId));
	await audit({ actor: 'admin', action: 'member.unlock', targetId: userId });
	return { ok: true as const };
}

export async function removeMember(groupId: string, userId: string) {
	await getDb()
		.delete(groupMember)
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
	await audit({ actor: 'admin', action: 'member.remove', targetId: userId, details: { groupId } });
	return { ok: true as const };
}

export async function groupStats(groupId: string) {
	const members = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(groupMember)
		.where(eq(groupMember.groupId, groupId));
	const lists = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(wishList)
		.where(and(eq(wishList.groupId, groupId), sql`${wishList.archivedAt} IS NULL`));
	const wishes = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(wish)
		.innerJoin(wishList, eq(wish.listId, wishList.id))
		.where(and(eq(wishList.groupId, groupId), sql`${wish.deletedAt} IS NULL`));
	const taken = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(reservation)
		.innerJoin(wish, eq(reservation.wishId, wish.id))
		.innerJoin(wishList, eq(wish.listId, wishList.id))
		.where(eq(wishList.groupId, groupId));
	return {
		members: Number(members[0]?.count ?? 0),
		lists: Number(lists[0]?.count ?? 0),
		wishes: Number(wishes[0]?.count ?? 0),
		taken: Number(taken[0]?.count ?? 0)
	};
}

export async function reservationsForGroup(groupId: string) {
	const buyer = alias(appUser, 'buyer');
	const owner = alias(appUser, 'owner');
	return getDb()
		.select({
			wishId: wish.id,
			title: wish.title,
			ownerName: owner.displayName,
			buyerName: buyer.displayName,
			status: reservation.status,
			at: reservation.createdAt,
			listTitle: wishList.title,
			listId: wishList.id
		})
		.from(reservation)
		.innerJoin(wish, eq(reservation.wishId, wish.id))
		.innerJoin(wishList, eq(wish.listId, wishList.id))
		.innerJoin(buyer, eq(buyer.id, reservation.buyerId))
		.innerJoin(owner, eq(owner.id, wish.ownerId))
		.where(eq(wishList.groupId, groupId))
		.orderBy(desc(reservation.createdAt));
}

export { ACCENTS };
