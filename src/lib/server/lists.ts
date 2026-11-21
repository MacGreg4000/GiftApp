import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { siteDomain } from '../domain';
import { reservationCard, type ReservationCard } from '../reservation-label';
import { audit } from './auth/audit';
import { getDb } from './db/client';
import { appGroup, appUser, contribution, groupMember, photo, reservation, wish, wishList } from './db/schema';
import { parseEurosToCents } from '../money';
import { contributionCount, contributionsOf } from './funding';
import type { LinkPreview } from './db/schema';
import { PhotoError, storeImage } from './photos';
import { listProgressForViewer, type WishProgress } from './secrecy/progress';
import { serializeWish, type ReservationRecord, type Viewer, type WishDto, type WishRecord } from './secrecy/dto';

const THEMES = ['noel', 'saint_nicolas', 'anniversaire', 'generique'] as const;
type ThemeId = (typeof THEMES)[number];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListedWish = WishDto & {
	domain: string | null;
	imageUrl: string | null;
	thumbUrl: string | null;
	ownerName: string;
	ownerLabel: string | null;
	card: ReservationCard;
};

export type ListPageData = {
	id: string;
	title: string;
	theme: string;
	eventDate: string | null;
	archived: boolean;
	recipient: { id: string; name: string } | null;
	group: { id: string; name: string };
	members: { id: string; displayName: string; label: string | null }[];
	wishes: ListedWish[];
	progress: { taken: number; total: number } | null;
	wishCount: number;
	canAdd: boolean;
	canEdit: boolean;
	viewerId: string | null;
	role: 'admin' | 'member';
};

type Result<T> = { ok: true } & T | { ok: false; message: string };

function dbText(error: unknown): string {
	if (!error) return '';
	if (error instanceof Error) {
		const cause = (error as { cause?: unknown }).cause;
		return `${error.message} ${dbText(cause)}`;
	}
	return String(error);
}

function cleanTitle(value: string, max: number): string | null {
	const title = value.trim().replace(/\s+/g, ' ');
	if (title.length < 1 || title.length > max) return null;
	return title;
}

function cleanUrl(value: string): string | null | 'bad' {
	const raw = value.trim();
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'bad';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'bad';
	if (url.username || url.password) return 'bad';
	if (url.toString().length > 2048) return 'bad';
	return url.toString();
}

function cleanDate(value: string): string | null | 'bad' {
	const raw = value.trim();
	if (!raw) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'bad';
	const [year, month, day] = raw.split('-').map(Number);
	const date = new Date(Date.UTC(year!, month! - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
		return 'bad';
	}
	return raw;
}

function isTheme(value: string): value is ThemeId {
	return (THEMES as readonly string[]).includes(value);
}

function iso(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

async function memberOf(groupId: string, userId: string): Promise<boolean> {
	const rows = await getDb()
		.select({ userId: groupMember.userId })
		.from(groupMember)
		.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
		.limit(1);
	return Boolean(rows[0]);
}

export async function createList(input: {
	actor: Viewer;
	groupId: string;
	title: string;
	theme: string;
	eventDate: string;
	recipientId: string;
}): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(input.groupId)) return { ok: false, message: 'Groupe introuvable.' };
	const title = cleanTitle(input.title, 100);
	if (!title) return { ok: false, message: 'Le nom de la liste doit faire entre 1 et 100 caractères.' };
	if (!isTheme(input.theme)) return { ok: false, message: 'Choisissez un thème.' };
	const eventDate = cleanDate(input.eventDate);
	if (eventDate === 'bad') return { ok: false, message: 'La date n’est pas valide.' };
	const recipientId = input.recipientId.trim();
	if (recipientId && !UUID_RE.test(recipientId)) {
		return { ok: false, message: 'La personne concernée est introuvable.' };
	}
	const groups = await getDb()
		.select({ id: appGroup.id, archivedAt: appGroup.archivedAt })
		.from(appGroup)
		.where(eq(appGroup.id, input.groupId))
		.limit(1);
	const group = groups[0];
	if (!group || group.archivedAt) return { ok: false, message: 'Ce groupe n’accepte plus de liste.' };
	if (input.actor.role !== 'member') {
		return { ok: false, message: 'Un membre du groupe crée la liste.' };
	}
	if (!(await memberOf(group.id, input.actor.userId))) {
		return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
	}
	if (recipientId && !(await memberOf(group.id, recipientId))) {
		return { ok: false, message: 'La personne concernée doit faire partie du groupe.' };
	}
	const rows = await getDb()
		.insert(wishList)
		.values({
			groupId: group.id,
			title,
			theme: input.theme,
			eventDate,
			recipientId: recipientId || null,
			createdBy: input.actor.userId
		})
		.returning({ id: wishList.id });
	const id = rows[0]!.id;
	await audit({
		actor: 'membre',
		action: 'list.create',
		targetId: id,
		details: { userId: input.actor.userId, theme: input.theme }
	});
	try {
		const { noteNewList } = await import('./push');
		await noteNewList({ groupId: group.id, listId: id, listTitle: title, actorId: input.actor.userId });
	} catch (error) {
		console.error(error);
	}
	return { ok: true, id };
}

export async function updateList(input: {
	actor: Viewer;
	listId: string;
	title: string;
	theme: string;
	eventDate: string;
	recipientId: string;
	archived: boolean;
}): Promise<Result<{ id: string }>> {
	if (input.actor.role !== 'admin') {
		return { ok: false, message: 'Seul l’administrateur modifie ou archive une liste.' };
	}
	if (!UUID_RE.test(input.listId)) return { ok: false, message: 'Liste introuvable.' };
	const title = cleanTitle(input.title, 100);
	if (!title) return { ok: false, message: 'Le nom de la liste doit faire entre 1 et 100 caractères.' };
	if (!isTheme(input.theme)) return { ok: false, message: 'Choisissez un thème.' };
	const eventDate = cleanDate(input.eventDate);
	if (eventDate === 'bad') return { ok: false, message: 'La date n’est pas valide.' };
	const recipientId = input.recipientId.trim();
	if (recipientId && !UUID_RE.test(recipientId)) {
		return { ok: false, message: 'La personne concernée est introuvable.' };
	}
	const current = await listRow(input.listId);
	if (!current) return { ok: false, message: 'Liste introuvable.' };
	if (recipientId && !(await memberOf(current.groupId, recipientId))) {
		return { ok: false, message: 'La personne concernée doit faire partie du groupe.' };
	}
	await getDb()
		.update(wishList)
		.set({
			title,
			theme: input.theme,
			eventDate,
			recipientId: recipientId || null,
			archivedAt: input.archived ? (current.archivedAt ?? new Date()) : null
		})
		.where(eq(wishList.id, input.listId));
	await audit({
		actor: 'admin',
		action: input.archived ? 'list.archive' : 'list.update',
		targetId: input.listId
	});
	return { ok: true, id: input.listId };
}

export async function setListArchived(listId: string, archived: boolean): Promise<void> {
	if (!UUID_RE.test(listId)) return;
	await getDb()
		.update(wishList)
		.set({ archivedAt: archived ? new Date() : null })
		.where(eq(wishList.id, listId));
	await audit({ actor: 'admin', action: archived ? 'list.archive' : 'list.restore', targetId: listId });
}

type ListContext = {
	id: string;
	groupId: string;
	title: string;
	theme: string;
	eventDate: string | null;
	recipientId: string | null;
	archivedAt: Date | null;
	groupName: string;
	groupArchived: Date | null;
};

async function listRow(listId: string): Promise<ListContext | null> {
	if (!UUID_RE.test(listId)) return null;
	const rows = await getDb()
		.select({
			id: wishList.id,
			groupId: wishList.groupId,
			title: wishList.title,
			theme: wishList.theme,
			eventDate: wishList.eventDate,
			recipientId: wishList.recipientId,
			archivedAt: wishList.archivedAt,
			groupName: appGroup.name,
			groupArchived: appGroup.archivedAt
		})
		.from(wishList)
		.innerJoin(appGroup, eq(appGroup.id, wishList.groupId))
		.where(eq(wishList.id, listId))
		.limit(1);
	return rows[0] ?? null;
}

async function canSee(list: ListContext, viewer: Viewer): Promise<boolean> {
	if (viewer.role === 'admin') return true;
	return memberOf(list.groupId, viewer.userId);
}

type WishFields = {
	title: string;
	url: string | null;
	description: string | null;
	priority: number;
	isSurprise: boolean;
};

function sharedPlan(input: { isShared: boolean; target: string }): { isShared: boolean; targetAmountCents: number | null } | { message: string } {
	if (!input.isShared) return { isShared: false, targetAmountCents: null };
	const cents = parseEurosToCents(input.target);
	if (cents === 'bad') return { message: 'Le montant visé est un nombre d’euros, par exemple 40 ou 40,50.' };
	return { isShared: true, targetAmountCents: cents };
}

function wishFields(input: {
	title: string;
	url: string;
	description: string;
	priority: number;
	isSurprise: boolean;
}): WishFields | { message: string } {
	const title = cleanTitle(input.title, 200);
	if (!title) return { message: 'Le titre doit faire entre 1 et 200 caractères.' };
	const url = cleanUrl(input.url);
	if (url === 'bad') return { message: 'Le lien doit commencer par http:// ou https://.' };
	const description = input.description.trim();
	if (description.length > 4000) return { message: 'La description est trop longue.' };
	const priority = input.priority;
	if (![1, 2, 3].includes(priority)) return { message: 'Choisissez une priorité.' };
	return {
		title,
		url,
		description: description || null,
		priority,
		isSurprise: input.isSurprise
	};
}

async function attachPreview(
	userId: string,
	preview: { title?: string | null; siteName?: string | null; photoId?: string | null } | null
): Promise<LinkPreview | null> {
	if (!preview?.photoId || !UUID_RE.test(preview.photoId)) {
		if (!preview?.title && !preview?.siteName) return null;
		return {
			title: preview?.title?.slice(0, 200) || undefined,
			site_name: preview?.siteName?.slice(0, 80) || undefined,
			fetched_at: new Date().toISOString()
		};
	}
	const rows = await getDb()
		.select({ id: photo.id })
		.from(photo)
		.where(and(eq(photo.id, preview.photoId), eq(photo.uploadedBy, userId), eq(photo.source, 'link_preview')))
		.limit(1);
	if (!rows[0]) return null;
	return {
		title: preview.title?.slice(0, 200) || undefined,
		site_name: preview.siteName?.slice(0, 80) || undefined,
		image_photo_id: preview.photoId,
		fetched_at: new Date().toISOString()
	};
}

async function saveUpload(userId: string, file: Buffer | null | undefined): Promise<string | null> {
	if (!file || file.length === 0) return null;
	try {
		const stored = await storeImage(file, 'upload', userId);
		return stored.id;
	} catch (error) {
		if (error instanceof PhotoError) throw error;
		throw new PhotoError('La photo n’a pas pu être enregistrée.');
	}
}

function cleanIdempotencyKey(value: string | null | undefined): string | null {
	const key = (value ?? '').trim().toLowerCase();
	if (!key) return null;
	return UUID_RE.test(key) ? key : null;
}

async function wishIdForKey(userId: string, key: string): Promise<string | null> {
	const rows = await getDb()
		.select({ id: wish.id })
		.from(wish)
		.where(and(eq(wish.idempotencyKey, key), eq(wish.ownerId, userId), isNull(wish.deletedAt)))
		.limit(1);
	return rows[0]?.id ?? null;
}

export async function createWish(input: {
	userId: string;
	listId: string;
	title: string;
	url: string;
	description: string;
	priority: number;
	isSurprise: boolean;
	isShared?: boolean;
	target?: string;
	photo?: Buffer | null;
	preview?: { title?: string | null; siteName?: string | null; photoId?: string | null } | null;
	idempotencyKey?: string | null;
}): Promise<Result<{ id: string }>> {
	const list = await listRow(input.listId);
	if (!list || list.archivedAt || list.groupArchived) return { ok: false, message: 'Cette liste n’accepte plus de souhait.' };
	if (!(await memberOf(list.groupId, input.userId))) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
	if (list.recipientId && list.recipientId !== input.userId) {
		return { ok: false, message: 'Cette liste rassemble les souhaits d’une seule personne.' };
	}
	const fields = wishFields(input);
	if ('message' in fields) return { ok: false, message: fields.message };
	const shared = sharedPlan({ isShared: input.isShared ?? false, target: input.target ?? '' });
	if ('message' in shared) return { ok: false, message: shared.message };
	const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
	if (idempotencyKey) {
		const already = await wishIdForKey(input.userId, idempotencyKey);
		if (already) return { ok: true, id: already };
	}
	let photoId: string | null = null;
	try {
		photoId = await saveUpload(input.userId, input.photo);
	} catch (error) {
		return { ok: false, message: error instanceof PhotoError ? error.message : 'Photo refusée.' };
	}
	const linkPreview = await attachPreview(input.userId, input.preview ?? null);
	const position = await getDb()
		.select({ next: sql<number>`coalesce(max(${wish.position}), -1) + 1` })
		.from(wish)
		.where(and(eq(wish.listId, list.id), eq(wish.ownerId, input.userId), isNull(wish.deletedAt)));
	try {
		const rows = await getDb()
			.insert(wish)
			.values({
				listId: list.id,
				ownerId: input.userId,
				title: fields.title,
				url: fields.url,
				description: fields.description,
				priority: fields.priority,
				isSurprise: fields.isSurprise,
				isShared: shared.isShared,
				targetAmountCents: shared.targetAmountCents,
				photoId,
				linkPreview,
				position: Number(position[0]?.next ?? 0),
				idempotencyKey
			})
			.returning({ id: wish.id });
		const id = rows[0]!.id;
		await audit({ actor: 'membre', action: 'wish.create', targetId: id, details: { userId: input.userId } });
		try {
			const { noteNewWish } = await import('./push');
			await noteNewWish({
				groupId: list.groupId,
				listId: list.id,
				wishId: id,
				listTitle: list.title,
				ownerId: input.userId
			});
		} catch (error) {
			console.error(error);
		}
		return { ok: true, id };
	} catch (error) {
		const text = dbText(error);
		if (idempotencyKey && /wish_idempotency_key_uq/.test(text)) {
			const already = await wishIdForKey(input.userId, idempotencyKey);
			if (already) return { ok: true, id: already };
			return { ok: false, message: 'Ce souhait a déjà été envoyé. Rouvrez le formulaire.' };
		}
		if (/wish_owner_must_be_recipient/.test(text)) {
			return { ok: false, message: 'Cette liste rassemble les souhaits d’une seule personne.' };
		}
		if (/owner_not_in_group/.test(text)) return { ok: false, message: 'Vous n’êtes pas dans ce groupe.' };
		throw error;
	}
}

export async function updateWish(input: {
	userId: string;
	wishId: string;
	title: string;
	url: string;
	description: string;
	priority: number;
	isSurprise: boolean;
	isShared?: boolean;
	target?: string;
	photo?: Buffer | null;
	removePhoto?: boolean;
	preview?: { title?: string | null; siteName?: string | null; photoId?: string | null } | null;
}): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(input.wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const rows = await getDb()
		.select({
			id: wish.id,
			ownerId: wish.ownerId,
			listId: wish.listId,
			photoId: wish.photoId,
			linkPreview: wish.linkPreview,
			isShared: wish.isShared
		})
		.from(wish)
		.where(and(eq(wish.id, input.wishId), isNull(wish.deletedAt)))
		.limit(1);
	const current = rows[0];
	if (!current || current.ownerId !== input.userId) return { ok: false, message: 'Vous ne pouvez modifier que vos souhaits.' };
	const list = await listRow(current.listId);
	if (!list || list.archivedAt) return { ok: false, message: 'Cette liste est archivée.' };
	const fields = wishFields(input);
	if ('message' in fields) return { ok: false, message: fields.message };
	const shared = sharedPlan({ isShared: input.isShared ?? current.isShared, target: input.target ?? '' });
	if ('message' in shared) return { ok: false, message: shared.message };
	if (!shared.isShared && current.isShared && (await contributionCount(current.id)) > 0) {
		return { ok: false, message: 'Des participations existent déjà : le cadeau commun reste en place.' };
	}
	let photoId = input.removePhoto ? null : current.photoId;
	try {
		const uploaded = await saveUpload(input.userId, input.photo);
		if (uploaded) photoId = uploaded;
	} catch (error) {
		return { ok: false, message: error instanceof PhotoError ? error.message : 'Photo refusée.' };
	}
	const preview = input.preview?.photoId || input.preview?.title ? await attachPreview(input.userId, input.preview) : null;
	await getDb().transaction(async (tx) => {
		await tx
			.update(wish)
			.set({
				title: fields.title,
				url: fields.url,
				description: fields.description,
				priority: fields.priority,
				isSurprise: fields.isSurprise,
				isShared: shared.isShared,
				targetAmountCents: shared.targetAmountCents,
				fundedAt: shared.isShared ? undefined : null,
				organizerId: shared.isShared ? undefined : null,
				purchasedAt: shared.isShared ? undefined : null,
				photoId,
				linkPreview: preview ?? current.linkPreview,
				updatedAt: new Date()
			})
			.where(eq(wish.id, current.id));
		if (shared.isShared) await tx.delete(reservation).where(eq(reservation.wishId, current.id));
		await tx
			.update(reservation)
			.set({ wishUpdatedAfter: true, updatedAt: new Date() })
			.where(eq(reservation.wishId, current.id));
	});
	await audit({ actor: 'membre', action: 'wish.update', targetId: current.id, details: { userId: input.userId } });
	return { ok: true, id: current.id };
}

export async function deleteWish(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const rows = await getDb()
		.update(wish)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(wish.id, wishId), eq(wish.ownerId, userId), isNull(wish.deletedAt)))
		.returning({ id: wish.id });
	if (!rows[0]) return { ok: false, message: 'Vous ne pouvez retirer que vos souhaits.' };
	await audit({ actor: 'membre', action: 'wish.delete', targetId: wishId, details: { userId } });
	return { ok: true, id: wishId };
}

function reservationMessage(error: unknown): string {
	const text = dbText(error);
	if (/cannot_reserve_own_wish/.test(text)) return 'Vous ne pouvez pas réserver votre propre souhait.';
	if (/buyer_not_in_group/.test(text)) return 'Vous n’êtes pas dans ce groupe.';
	if (/shared_wish_not_reservable/.test(text)) return 'Ce souhait ne se réserve pas.';
	if (/duplicate key|reservation_pkey/i.test(text)) return 'Ce souhait vient d’être pris.';
	return 'La réservation n’a pas abouti.';
}

export async function reserveWish(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const rows = await getDb()
		.select({ listId: wish.listId, deletedAt: wish.deletedAt })
		.from(wish)
		.where(eq(wish.id, wishId))
		.limit(1);
	const current = rows[0];
	if (!current || current.deletedAt) return { ok: false, message: 'Souhait introuvable.' };
	const list = await listRow(current.listId);
	if (!list || list.archivedAt) return { ok: false, message: 'Cette liste est archivée.' };
	try {
		await getDb().insert(reservation).values({ wishId, buyerId: userId, status: 'reserve' });
	} catch (error) {
		return { ok: false, message: reservationMessage(error) };
	}
	await audit({ actor: 'membre', action: 'reservation.create', targetId: wishId, details: { userId } });
	return { ok: true, id: wishId };
}

export async function cancelReservation(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const rows = await getDb()
		.delete(reservation)
		.where(and(eq(reservation.wishId, wishId), eq(reservation.buyerId, userId)))
		.returning({ wishId: reservation.wishId });
	if (!rows[0]) return { ok: false, message: 'Cette réservation n’est pas la vôtre.' };
	await audit({ actor: 'membre', action: 'reservation.cancel', targetId: wishId, details: { userId } });
	return { ok: true, id: wishId };
}

export async function markPurchased(userId: string, wishId: string): Promise<Result<{ id: string }>> {
	if (!UUID_RE.test(wishId)) return { ok: false, message: 'Souhait introuvable.' };
	const rows = await getDb()
		.update(reservation)
		.set({ status: 'achete', updatedAt: new Date() })
		.where(and(eq(reservation.wishId, wishId), eq(reservation.buyerId, userId)))
		.returning({ wishId: reservation.wishId });
	if (!rows[0]) return { ok: false, message: 'Cette réservation n’est pas la vôtre.' };
	await audit({ actor: 'membre', action: 'reservation.bought', targetId: wishId, details: { userId } });
	return { ok: true, id: wishId };
}

function imageUrls(photoId: string | null, previewId: string | undefined, surprise: boolean): { imageUrl: string | null; thumbUrl: string | null } {
	const id = photoId ?? (surprise ? null : (previewId ?? null));
	if (!id) return { imageUrl: null, thumbUrl: null };
	return { imageUrl: `/photos/${id}`, thumbUrl: `/photos/${id}?taille=mini` };
}

export async function loadListPage(listId: string, viewer: Viewer): Promise<ListPageData | null> {
	const list = await listRow(listId);
	if (!list || !(await canSee(list, viewer))) return null;
	const members = await getDb()
		.select({
			id: appUser.id,
			displayName: appUser.displayName,
			label: groupMember.label
		})
		.from(groupMember)
		.innerJoin(appUser, eq(appUser.id, groupMember.userId))
		.where(eq(groupMember.groupId, list.groupId))
		.orderBy(asc(appUser.displayName));
	const wishRows = await getDb()
		.select({
			id: wish.id,
			listId: wish.listId,
			ownerId: wish.ownerId,
			title: wish.title,
			url: wish.url,
			description: wish.description,
			priority: wish.priority,
			position: wish.position,
			isSurprise: wish.isSurprise,
			isShared: wish.isShared,
			targetAmountCents: wish.targetAmountCents,
			fundedAt: wish.fundedAt,
			organizerId: wish.organizerId,
			purchasedAt: wish.purchasedAt,
			photoId: wish.photoId,
			linkPreview: wish.linkPreview,
			ownerName: appUser.displayName
		})
		.from(wish)
		.innerJoin(appUser, eq(appUser.id, wish.ownerId))
		.where(and(eq(wish.listId, list.id), isNull(wish.deletedAt)))
		.orderBy(asc(wish.priority), asc(wish.position), asc(wish.createdAt));
	const reserved = await getDb()
		.select({
			wishId: reservation.wishId,
			buyerId: reservation.buyerId,
			buyerName: appUser.displayName,
			status: reservation.status,
			buyerNote: reservation.buyerNote,
			wishUpdatedAfter: reservation.wishUpdatedAfter,
			createdAt: reservation.createdAt
		})
		.from(reservation)
		.innerJoin(wish, eq(wish.id, reservation.wishId))
		.innerJoin(appUser, eq(appUser.id, reservation.buyerId))
		.where(and(eq(wish.listId, list.id), isNull(wish.deletedAt)));
	const byWish = new Map(reserved.map((row) => [row.wishId, row]));
	const labels = new Map(members.map((member) => [member.id, member.label]));
	const names = new Map(members.map((member) => [member.id, member.displayName]));
	const giftRows = wishRows.filter((row) => row.isShared);
	const gifts = new Map<string, Awaited<ReturnType<typeof contributionsOf>>>();
	for (const row of giftRows) gifts.set(row.id, await contributionsOf(row.id));
	const wishes: ListedWish[] = wishRows.map((row) => {
		const record: WishRecord = {
			id: row.id,
			listId: row.listId,
			ownerId: row.ownerId,
			title: row.title,
			url: row.url,
			description: row.description,
			priority: row.priority,
			position: row.position,
			isSurprise: row.isSurprise,
			isShared: row.isShared,
			targetAmountCents: row.targetAmountCents,
			fundedAt: iso(row.fundedAt),
			organizerId: row.organizerId,
			purchasedAt: iso(row.purchasedAt)
		};
		const held = byWish.get(row.id);
		const reservationRecord: ReservationRecord | null = held
			? {
					buyerId: held.buyerId,
					buyerName: held.buyerName,
					status: held.status,
					buyerNote: held.buyerNote,
					wishUpdatedAfter: held.wishUpdatedAfter,
					createdAt: held.createdAt.toISOString()
				}
			: null;
		const dto = serializeWish(
			record,
			reservationRecord,
			gifts.get(row.id) ?? [],
			viewer,
			row.organizerId ? (names.get(row.organizerId) ?? null) : null
		);
		const images = imageUrls(row.photoId, row.linkPreview?.image_photo_id, row.isSurprise);
		const hideSurpriseLink =
			row.isSurprise && viewer.role !== 'admin' && (viewer.role !== 'member' || viewer.userId !== row.ownerId);
		return {
			...dto,
			url: hideSurpriseLink ? null : dto.url,
			...images,
			domain: row.isSurprise ? null : siteDomain(row.url),
			ownerName: row.ownerName,
			ownerLabel: labels.get(row.ownerId) ?? null,
			card: reservationCard(dto)
		};
	});
	const progressRows: WishProgress[] = wishRows.map((row) => ({
		id: row.id,
		listId: row.listId,
		ownerId: row.ownerId,
		taken: byWish.has(row.id) || Boolean(row.isShared && (row.fundedAt || row.purchasedAt))
	}));
	const progressViewer = viewer.role === 'member' ? viewer.userId : '00000000-0000-0000-0000-000000000000';
	const recipient = list.recipientId ? members.find((member) => member.id === list.recipientId) : undefined;
	const viewerId = viewer.role === 'member' ? viewer.userId : null;
	return {
		id: list.id,
		title: list.title,
		theme: list.theme,
		eventDate: list.eventDate,
		archived: Boolean(list.archivedAt),
		recipient: recipient ? { id: recipient.id, name: recipient.displayName } : null,
		group: { id: list.groupId, name: list.groupName },
		members,
		wishes,
		progress: listProgressForViewer(progressRows, progressViewer),
		wishCount: wishes.length,
		canAdd: Boolean(viewerId && !list.archivedAt && !list.groupArchived && (!list.recipientId || list.recipientId === viewerId)),
		canEdit: viewer.role === 'admin',
		viewerId,
		role: viewer.role
	};
}

/** Corps JSON de GET /listes/:id/json. Même frontière que la page. */
export async function wishesPayload(listId: string, viewer: Viewer): Promise<{ wishes: ListedWish[] } | null> {
	const page = await loadListPage(listId, viewer);
	if (!page) return null;
	return { wishes: page.wishes };
}

export async function adminListRegister() {
	const lists = await getDb()
		.select({
			id: wishList.id,
			title: wishList.title,
			theme: wishList.theme,
			eventDate: wishList.eventDate,
			archivedAt: wishList.archivedAt,
			groupId: appGroup.id,
			groupName: appGroup.name,
			recipientName: appUser.displayName
		})
		.from(wishList)
		.innerJoin(appGroup, eq(appGroup.id, wishList.groupId))
		.leftJoin(appUser, eq(appUser.id, wishList.recipientId))
		.orderBy(desc(wishList.createdAt));
	const counts = await getDb()
		.select({
			listId: wish.listId,
			n: sql<number>`count(*)::int`,
			taken: sql<number>`count(${reservation.wishId})::int`
		})
		.from(wish)
		.leftJoin(reservation, eq(reservation.wishId, wish.id))
		.where(isNull(wish.deletedAt))
		.groupBy(wish.listId);
	const byList = new Map(counts.map((row) => [row.listId, row]));
	return lists.map((list) => ({
		...list,
		wishes: Number(byList.get(list.id)?.n ?? 0),
		taken: Number(byList.get(list.id)?.taken ?? 0)
	}));
}

export async function mySpace(userId: string) {
	const mine = await getDb()
		.select({
			id: wish.id,
			title: wish.title,
			priority: wish.priority,
			isSurprise: wish.isSurprise,
			isShared: wish.isShared,
			targetAmountCents: wish.targetAmountCents,
			listId: wishList.id,
			listTitle: wishList.title,
			groupName: appGroup.name
		})
		.from(wish)
		.innerJoin(wishList, eq(wishList.id, wish.listId))
		.innerJoin(appGroup, eq(appGroup.id, wishList.groupId))
		.where(and(eq(wish.ownerId, userId), isNull(wish.deletedAt)))
		.orderBy(desc(wish.createdAt));
	const buying = await getDb()
		.select({
			wishId: wish.id,
			title: wish.title,
			ownerName: appUser.displayName,
			listId: wishList.id,
			listTitle: wishList.title,
			status: reservation.status,
			changed: reservation.wishUpdatedAfter,
			deletedAt: wish.deletedAt
		})
		.from(reservation)
		.innerJoin(wish, eq(wish.id, reservation.wishId))
		.innerJoin(appUser, eq(appUser.id, wish.ownerId))
		.innerJoin(wishList, eq(wishList.id, wish.listId))
		.where(eq(reservation.buyerId, userId))
		.orderBy(desc(reservation.createdAt));
	const pledges = await getDb()
		.select({
			wishId: wish.id,
			title: wish.title,
			ownerName: appUser.displayName,
			listId: wishList.id,
			listTitle: wishList.title,
			amountCents: contribution.amountCents,
			fractionNum: contribution.fractionNum,
			fractionDen: contribution.fractionDen,
			funded: wish.fundedAt,
			purchased: wish.purchasedAt
		})
		.from(contribution)
		.innerJoin(wish, eq(wish.id, contribution.wishId))
		.innerJoin(appUser, eq(appUser.id, wish.ownerId))
		.innerJoin(wishList, eq(wishList.id, wish.listId))
		.where(and(eq(contribution.memberId, userId), isNull(wish.deletedAt)))
		.orderBy(desc(contribution.updatedAt));
	return {
		wishes: mine,
		pledges: pledges.map((row) => ({
			wishId: row.wishId,
			title: row.title,
			ownerName: row.ownerName,
			listId: row.listId,
			listTitle: row.listTitle,
			amountCents: row.amountCents,
			fractionNum: row.fractionNum,
			fractionDen: row.fractionDen,
			funded: Boolean(row.funded),
			purchased: Boolean(row.purchased)
		})),
		buying: buying.map((row) => ({
			wishId: row.wishId,
			title: row.title,
			ownerName: row.ownerName,
			listId: row.listId,
			listTitle: row.listTitle,
			status: row.status,
			changed: row.changed,
			gone: Boolean(row.deletedAt)
		}))
	};
}
