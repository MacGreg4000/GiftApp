import { lookup } from 'node:dns/promises';
import { and, eq, isNull } from 'drizzle-orm';
import { sendNotification, setVapidDetails } from 'web-push';
import { eventOffsetDays } from '../format';
import { noticeText, readPrefs, recipients, type Notice, type NoticeKind } from '../notify-copy';
import { getConfig, pushConfigured } from './config';
import { getDb } from './db/client';
import { appUser, groupMember, notificationSent, pushSubscription, wishList } from './db/schema';
import { isBlockedHostname, isBlockedIp, urlBlockReason } from './net/ssrf';

let vapidReady = false;

function ensureVapid() {
	if (vapidReady) return;
	const config = getConfig();
	setVapidDetails(config.vapidSubject || 'mailto:admin@localhost', config.vapidPublicKey, config.vapidPrivateKey);
	vapidReady = true;
}

/** Refus des points de terminaison locaux avant tout envoi, pour ne pas transformer une inscription en requête interne. */
export function endpointShapeProblem(raw: string): string | null {
	const reason = urlBlockReason(raw);
	if (reason) return reason;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'Lien illisible';
	}
	if (url.protocol !== 'https:') return 'Seuls les points https sont acceptés';
	if (isBlockedHostname(url.hostname)) return 'Adresse locale refusée';
	if (url.toString().length > 2000) return 'Adresse trop longue';
	return null;
}

export async function acceptableEndpoint(raw: string): Promise<string | null> {
	if (endpointShapeProblem(raw)) return null;
	const url = new URL(raw);
	try {
		const looked = await lookup(url.hostname, { all: true });
		if (looked.length === 0 || looked.some((item) => isBlockedIp(item.address))) return null;
	} catch {
		return null;
	}
	return url.toString();
}

export async function saveSubscription(
	userId: string,
	input: { endpoint: string; p256dh: string; auth: string; label?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!pushConfigured()) return { ok: false, message: 'Les notifications ne sont pas activées sur ce serveur.' };
	const endpoint = await acceptableEndpoint(input.endpoint);
	if (!endpoint) return { ok: false, message: 'Ce navigateur n’a pas pu être enregistré.' };
	const p256dh = input.p256dh.trim();
	const auth = input.auth.trim();
	if (p256dh.length < 8 || p256dh.length > 200 || auth.length < 8 || auth.length > 200) {
		return { ok: false, message: 'Inscription incomplète.' };
	}
	await getDb()
		.insert(pushSubscription)
		.values({
			userId,
			endpoint,
			p256dh,
			authSecret: auth,
			deviceLabel: input.label?.slice(0, 80) || null
		})
		.onConflictDoUpdate({
			target: pushSubscription.endpoint,
			set: { userId, p256dh, authSecret: auth, deviceLabel: input.label?.slice(0, 80) || null, failureCount: 0 }
		});
	return { ok: true };
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
	await getDb()
		.delete(pushSubscription)
		.where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

export async function savePrefs(
	userId: string,
	input: { newList: boolean; newWish: boolean; sharedFunded: boolean; eventReminder: boolean }
): Promise<void> {
	await getDb()
		.update(appUser)
		.set({
			notifyPrefs: {
				new_list: input.newList,
				new_wish: input.newWish,
				shared_funded: input.sharedFunded,
				event_reminder: input.eventReminder
			}
		})
		.where(eq(appUser.id, userId));
}

async function memberPrefs(groupId: string) {
	const rows = await getDb()
		.select({ id: appUser.id, prefs: appUser.notifyPrefs })
		.from(groupMember)
		.innerJoin(appUser, eq(appUser.id, groupMember.userId))
		.where(and(eq(groupMember.groupId, groupId), eq(appUser.isActive, true)));
	return rows.map((row) => ({ id: row.id, prefs: readPrefs(row.prefs) }));
}

async function deliver(userId: string, text: ReturnType<typeof noticeText>) {
	const claimed = await getDb()
		.insert(notificationSent)
		.values({ userId, kind: text.dedupeKind, refId: text.refId })
		.onConflictDoNothing()
		.returning({ userId: notificationSent.userId });
	if (!claimed[0]) return;
	const devices = await getDb().select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
	if (devices.length === 0 || !pushConfigured()) return;
	ensureVapid();
	const payload = JSON.stringify({ title: text.title, body: text.body, url: text.url });
	for (const device of devices) {
		const endpoint = await acceptableEndpoint(device.endpoint);
		if (!endpoint) {
			await getDb().delete(pushSubscription).where(eq(pushSubscription.id, device.id));
			continue;
		}
		try {
			await sendNotification(
				{ endpoint, keys: { p256dh: device.p256dh, auth: device.authSecret } },
				payload
			);
			await getDb()
				.update(pushSubscription)
				.set({ lastSuccessAt: new Date(), failureCount: 0 })
				.where(eq(pushSubscription.id, device.id));
		} catch (error) {
			const status = (error as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) {
				await getDb().delete(pushSubscription).where(eq(pushSubscription.id, device.id));
				continue;
			}
			const failures = device.failureCount + 1;
			if (failures >= 5) {
				await getDb().delete(pushSubscription).where(eq(pushSubscription.id, device.id));
			} else {
				await getDb()
					.update(pushSubscription)
					.set({ failureCount: failures })
					.where(eq(pushSubscription.id, device.id));
			}
		}
	}
}

export async function dispatch(groupId: string, notice: Notice, extra: { actorId?: string | null; ownerId?: string | null }) {
	if (process.env.VITEST || !pushConfigured()) return;
	const text = noticeText(notice);
	const kind: NoticeKind = notice.kind;
	const ids = recipients({ kind, members: await memberPrefs(groupId), ...extra });
	for (const userId of ids) {
		await deliver(userId, text);
	}
}

export async function noteNewList(input: { groupId: string; listId: string; listTitle: string; actorId: string | null }) {
	await dispatch(
		input.groupId,
		{ kind: 'new_list', listId: input.listId, listTitle: input.listTitle },
		{ actorId: input.actorId }
	);
}

export async function noteNewWish(input: {
	groupId: string;
	listId: string;
	wishId: string;
	listTitle: string;
	ownerId: string;
}) {
	await dispatch(
		input.groupId,
		{ kind: 'new_wish', listId: input.listId, wishId: input.wishId, listTitle: input.listTitle },
		{ actorId: input.ownerId, ownerId: input.ownerId }
	);
}

export async function noteSharedFunded(input: {
	groupId: string;
	listId: string;
	listTitle: string;
	wishId: string;
	wishTitle: string;
	ownerId: string;
}) {
	await dispatch(
		input.groupId,
		{
			kind: 'shared_funded',
			listId: input.listId,
			wishId: input.wishId,
			listTitle: input.listTitle,
			wishTitle: input.wishTitle
		},
		{ ownerId: input.ownerId }
	);
}

export async function dispatchReminders(now = new Date()) {
	if (process.env.VITEST || !pushConfigured()) return;
	const lists = await getDb()
		.select({
			id: wishList.id,
			title: wishList.title,
			groupId: wishList.groupId,
			eventDate: wishList.eventDate
		})
		.from(wishList)
		.where(and(isNull(wishList.archivedAt)));
	for (const list of lists) {
		const days = eventOffsetDays(list.eventDate, now);
		if (days !== 7 && days !== 1) continue;
		await dispatch(
			list.groupId,
			{ kind: 'event_reminder', listId: list.id, listTitle: list.title, days },
			{}
		);
	}
}
