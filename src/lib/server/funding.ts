import { and, eq, isNull, sql } from 'drizzle-orm';
import { parseEurosToCents } from '../money';
import { audit } from './auth/audit';
import { getDb } from './db/client';
import { appUser, contribution, groupMember, reservation, wish, wishList } from './db/schema';
import { fundingAggregates, type ContributionRecord, type Viewer } from './secrecy/dto';

type Result<T> = { ok: true } & T | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbText(error: unknown): string {
	if (!error) return '';
	if (error instanceof Error) {
		const cause = (error as { cause?: unknown }).cause;
		return `${error.message} ${dbText(cause)}`;
	}
	return String(error);
}

function contributionMessage(error: unknown): string {
	const text = dbText(error);
	if (/owner_cannot_contribute/.test(text)) return 'Vous ne participez pas à votre propre souhait.';
	if (/contribution_requires_shared_wish/.test(text)) return 'Ce souhait n’est pas un cadeau commun.';
	if (/contribution_after_purchase/.test(text)) return 'Ce cadeau est déjà acheté.';
	if (/contributor_not_in_group/.test(text)) return 'Vous n’êtes pas dans ce groupe.';
	return 'La participation n’a pas abouti.';
}

type SharedRow = {
	id: string;
	title: string;
	ownerId: string;
	isShared: boolean;
	targetAmountCents: number | null;
	fundedAt: Date | null;
	organizerId: string | null;
	purchasedAt: Date | null;
	listId: string;
	listTitle: string;
	groupId: string;
	archivedAt: Date | null;
};

async function sharedRow(wishId: string): Promise<SharedRow | null> {
	const rows = await getDb()
		.select({
			id: wish.id,
			title: wish.title,
			ownerId: wish.ownerId,
			isShared: wish.isShared,
			targetAmountCents: wish.targetAmountCents,
			fundedAt: wish.fundedAt,
			organizerId: wish.organizerId,
			purchasedAt: wish.purchasedAt,
			listId: wish.listId,
			listTitle: wishList.title,
			groupId: wishList.groupId,
			archivedAt: wishList.archivedAt
		})
		.from(wish)
		.innerJoin(wishList, eq(wishList.id, wish.listId))
		.where(and(eq(wish.id, wishId), isNull(wish.deletedAt)))
		.limit(1);
	return rows[0] ?? null;
}

async function memberOf(groupId: string, userId: string): Promise<boolean> {
	const rows = await getDb()
		.select({ userId: groupMember.userId })
		.from(groupMember)
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
		.limit(1);
	return Boolean(rows[0]);
}

export async function contributionsOf(wishId: string): Promise<ContributionRecord[]> {
	const rows = await getDb()
		.select({
			memberId: contribution.memberId,
			memberName: appUser.displayName,
			amountCents: contribution.amountCents,
			fractionNum: contribution.fractionNum,
			fractionDen: contribution.fractionDen
		})
		.from(contribution)
		.innerJoin(appUser, eq(appUser.id, contribution.memberId))
		.where(eq(contribution.wishId, wishId));
	return rows;
}

async function rememberFunded(row: SharedRow, fundedNow: boolean) {
	if (!fundedNow || row.fundedAt) return;
	const { noteSharedFunded } = await import('./push');
	await noteSharedFunded({
		groupId: row.groupId,
		listId: row.listId,
		listTitle: row.listTitle,
		wishId: row.id,
		wishTitle: row.title,
		ownerId: row.ownerId
	});
}

async function setFunded(row: SharedRow, organizerId: string | null): Promise<boolean> {
	if (row.fundedAt) {
		if (organizerId && !row.organizerId) {
			await getDb().update(wish).set({ organizerId, updatedAt: new Date() }).where(eq(wish.id, row.id));
		}
		return false;
	}
	await getDb()
		.update(wish)
		.set({
			fundedAt: new Date(),
			organizerId: row.organizerId ?? organizerId,
			updatedAt: new Date()
		})
		.where(eq(wish.id, row.id));
	await rememberFunded(row, true);
	return true;
}

function openWish(row: SharedRow | null): Result<{ row: SharedRow }> {
	if (!row) return { ok: false, message: 'Souhait introuvable.' };
	if (!row.isShared) return { ok: false, message: 'Ce souhait n’est pas un cadeau commun.' };
	if (row.archivedAt) return { ok: false, message: 'Cette liste est archivée.' };
	if (row.purchasedAt) return { ok: false, message: 'Ce cadeau est déjà acheté.' };
	return { ok: true, row };
}

export async function pledge(input: {
	userId: string;
	wishId: string;
	mode: string;
	euros: string;
	fraction: string;
}): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(input.wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const opened = openWish(await sharedRow(input.wishId));
	if (!opened.ok) return opened;
	const row = opened.row;
	if (row.ownerId === input.userId) return { ok: false, message: 'Vous ne participez pas à votre propre souhait.' };
	if (!(await memberOf(row.groupId, input.userId))) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
	let amountCents: number | null = null;
	let fractionNum: number | null = null;
	let fractionDen: number | null = null;
	if (input.mode === 'part') {
		const match = /^(\d+)\s*\/\s*(\d+)$/.exec(input.fraction.trim());
		if (!match) return { ok: false, message: 'Choisissez une part, par exemple 1/4.' };
		fractionNum = Number(match[1]);
		fractionDen = Number(match[2]);
		if (fractionNum < 1 || fractionDen < 2 || fractionDen > 20 || fractionNum > fractionDen) {
			return { ok: false, message: 'Cette part n’est pas acceptée.' };
		}
	} else {
		const cents = parseEurosToCents(input.euros);
		if (cents === 'bad' || cents === null) return { ok: false, message: 'Indiquez un montant en euros, par exemple 15 ou 15,50.' };
		amountCents = cents;
	}
	try {
		await getDb()
			.insert(contribution)
			.values({ wishId: row.id, memberId: input.userId, amountCents, fractionNum, fractionDen })
			.onConflictDoUpdate({
				target: [contribution.wishId, contribution.memberId],
				set: { amountCents, fractionNum, fractionDen, updatedAt: new Date() }
			});
	} catch (error) {
		return { ok: false, message: contributionMessage(error) };
	}
	await audit({ actor: 'membre', action: 'contribution.upsert', targetId: row.id, details: { userId: input.userId } });
	await maybeAutoFund(row);
	return { ok: true, id: row.id };
}

async function maybeAutoFund(row: SharedRow) {
	if (!row.targetAmountCents || row.fundedAt) return;
	const items = await contributionsOf(row.id);
	const totals = fundingAggregates(
		{
			id: row.id,
			listId: row.listId,
			ownerId: row.ownerId,
			title: row.title,
			url: null,
			description: null,
			priority: 2,
			position: 0,
			isSurprise: false,
			isShared: true,
			targetAmountCents: row.targetAmountCents,
			fundedAt: null,
			organizerId: row.organizerId,
			purchasedAt: null
		},
		items
	);
	if (totals.isFunded) await setFunded(row, row.organizerId);
}

export async function withdrawPledge(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const row = await sharedRow(wishId);
	if (!row) return { ok: false, message: 'Souhait introuvable.' };
	if (row.purchasedAt) return { ok: false, message: 'Ce cadeau est déjà acheté.' };
	const removed = await getDb()
		.delete(contribution)
		.where(and(eq(contribution.wishId, wishId), eq(contribution.memberId, userId)))
		.returning({ id: contribution.id });
	if (!removed[0]) return { ok: false, message: 'Vous n’avez pas de participation sur ce souhait.' };
	if (row.targetAmountCents && row.fundedAt) {
		const items = await contributionsOf(wishId);
		const totals = fundingAggregates(
			{
				id: row.id,
				listId: row.listId,
				ownerId: row.ownerId,
				title: row.title,
				url: null,
				description: null,
				priority: 2,
				position: 0,
				isSurprise: false,
				isShared: true,
				targetAmountCents: row.targetAmountCents,
				fundedAt: row.fundedAt.toISOString(),
				organizerId: row.organizerId,
				purchasedAt: null
			},
			items
		);
		if (totals.fundedPercent < 100) {
			await getDb().update(wish).set({ fundedAt: null, updatedAt: new Date() }).where(eq(wish.id, wishId));
		}
	}
	await audit({ actor: 'membre', action: 'contribution.withdraw', targetId: wishId, details: { userId } });
	return { ok: true, id: wishId };
}

export async function claimOrganizer(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const opened = openWish(await sharedRow(wishId));
	if (!opened.ok) return opened;
	const row = opened.row;
	if (row.ownerId === userId) return { ok: false, message: 'Vous ne pouvez pas organiser votre propre souhait.' };
	if (!(await memberOf(row.groupId, userId))) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
	if (row.organizerId && row.organizerId !== userId) return { ok: false, message: 'Quelqu’un s’en occupe déjà.' };
	await getDb().update(wish).set({ organizerId: userId, updatedAt: new Date() }).where(eq(wish.id, row.id));
	await audit({ actor: 'membre', action: 'contribution.claim', targetId: row.id, details: { userId } });
	return { ok: true, id: row.id };
}

export async function completeRest(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const opened = openWish(await sharedRow(wishId));
	if (!opened.ok) return opened;
	const row = opened.row;
	if (!row.targetAmountCents) return { ok: false, message: 'Ce cadeau n’a pas de montant visé.' };
	if (row.ownerId === userId) return { ok: false, message: 'Vous ne participez pas à votre propre souhait.' };
	if (!(await memberOf(row.groupId, userId))) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
	if (row.organizerId && row.organizerId !== userId) {
		return { ok: false, message: 'Quelqu’un s’en occupe déjà.' };
	}
	const items = await contributionsOf(row.id);
	const others = items.filter((item) => item.memberId !== userId);
	const soFar = fundingAggregates(
		{
			id: row.id,
			listId: row.listId,
			ownerId: row.ownerId,
			title: row.title,
			url: null,
			description: null,
			priority: 2,
			position: 0,
			isSurprise: false,
			isShared: true,
			targetAmountCents: row.targetAmountCents,
			fundedAt: null,
			organizerId: row.organizerId,
			purchasedAt: null
		},
		others
	);
	const remaining = row.targetAmountCents - (soFar.fundedTotalCents ?? 0);
	if (remaining > 0) {
		try {
			await getDb()
				.insert(contribution)
				.values({
					wishId: row.id,
					memberId: userId,
					amountCents: remaining,
					fractionNum: null,
					fractionDen: null
				})
				.onConflictDoUpdate({
					target: [contribution.wishId, contribution.memberId],
					set: { amountCents: remaining, fractionNum: null, fractionDen: null, updatedAt: new Date() }
				});
		} catch (error) {
			return { ok: false, message: contributionMessage(error) };
		}
	}
	await setFunded({ ...row, organizerId: row.organizerId ?? userId }, userId);
	await audit({ actor: 'membre', action: 'contribution.complete', targetId: row.id, details: { userId } });
	return { ok: true, id: row.id };
}

export async function markSharedFunded(actor: Viewer, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const opened = openWish(await sharedRow(wishId));
	if (!opened.ok) return opened;
	const row = opened.row;
	if (actor.role === 'member') {
		if (actor.userId === row.ownerId) return { ok: false, message: 'Ce suivi ne vous est pas montré.' };
		if (!(await memberOf(row.groupId, actor.userId))) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
		if (row.organizerId && row.organizerId !== actor.userId) {
			return { ok: false, message: 'Seul l’organisateur marque le cadeau comme financé.' };
		}
		await setFunded(row, actor.userId);
	} else {
		await setFunded(row, row.organizerId);
	}
	await audit({
		actor: actor.role === 'admin' ? 'admin' : 'membre',
		action: 'contribution.funded',
		targetId: row.id,
		details: actor.role === 'member' ? { userId: actor.userId } : {}
	});
	return { ok: true, id: row.id };
}

export async function markSharedPurchased(actor: Viewer, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const row = await sharedRow(wishId);
	if (!row || !row.isShared) return { ok: false, message: 'Ce souhait n’est pas un cadeau commun.' };
	if (row.archivedAt) return { ok: false, message: 'Cette liste est archivée.' };
	if (!row.fundedAt) return { ok: false, message: 'Le cadeau n’est pas encore financé.' };
	if (row.purchasedAt) return { ok: true, id: row.id };
	if (actor.role === 'member') {
		if (row.organizerId !== actor.userId) return { ok: false, message: 'Seul l’organisateur marque le cadeau comme acheté.' };
	}
	await getDb().update(wish).set({ purchasedAt: new Date(), updatedAt: new Date() }).where(eq(wish.id, row.id));
	await audit({
		actor: actor.role === 'admin' ? 'admin' : 'membre',
		action: 'contribution.bought',
		targetId: row.id,
		details: actor.role === 'member' ? { userId: actor.userId } : {}
	});
	return { ok: true, id: row.id };
}

export async function contributionCount(wishId: string): Promise<number> {
	const rows = await getDb()
		.select({ n: sql<number>`count(*)::int` })
		.from(contribution)
		.where(eq(contribution.wishId, wishId));
	return Number(rows[0]?.n ?? 0);
}

export async function clearReservations(wishId: string): Promise<void> {
	await getDb().delete(reservation).where(eq(reservation.wishId, wishId));
}
