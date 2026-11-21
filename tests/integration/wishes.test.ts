import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '#lib/server/db/client';
import { resetMigrationFlag, runMigrations } from '#lib/server/db/migrate';
import { appGroup, appUser, groupMember } from '#lib/server/db/schema';
import { resetSetupCache } from '#lib/server/setup';
import { reservationText } from '#lib/reservation-label';
import { memberPayloadLeaks } from '#lib/server/secrecy/dto';
import { completeRest, pledge } from '#lib/server/funding';
import {
	cancelReservation,
	createList,
	createWish,
	loadListPage,
	reserveWish,
	wishesPayload
} from '#lib/server/lists';

process.env.DATABASE_URL ??= 'postgres://wishlist:wishlist-dev-password@127.0.0.1:54329/wishlist';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function truncate() {
	await getDb().execute(sql`
		TRUNCATE TABLE
			notification_sent, push_subscription, contribution, reservation, wish, photo,
			wish_list, group_member, app_group, login_attempt, session, audit_log,
			ip_lock, security_state, admin_account, app_user
		RESTART IDENTITY CASCADE
	`);
	resetSetupCache();
}

describeDb('listes, souhaits et secret de réservation', () => {
	beforeAll(async () => {
		resetMigrationFlag();
		await runMigrations();
	});

	beforeEach(async () => {
		await truncate();
	});

	afterAll(async () => {
		await closeDb();
	});

	it('cache la réservation au propriétaire, la montre sans nom aux autres, et la nomme à l’admin', async () => {
		const alice = await getDb()
			.insert(appUser)
			.values({ displayName: 'Alice', loginName: 'alice-liste', pinHash: 'x' })
			.returning();
		const marc = await getDb()
			.insert(appUser)
			.values({ displayName: 'Marc', loginName: 'marc-liste', pinHash: 'x' })
			.returning();
		const lea = await getDb()
			.insert(appUser)
			.values({ displayName: 'Léa', loginName: 'lea-liste', pinHash: 'x' })
			.returning();
		const outsider = await getDb()
			.insert(appUser)
			.values({ displayName: 'Hugo', loginName: 'hugo-liste', pinHash: 'x' })
			.returning();
		const group = await getDb().insert(appGroup).values({ name: 'Famille Martin' }).returning();
		await getDb().insert(groupMember).values([
			{ groupId: group[0]!.id, userId: alice[0]!.id, label: 'Sœur' },
			{ groupId: group[0]!.id, userId: marc[0]!.id },
			{ groupId: group[0]!.id, userId: lea[0]!.id }
		]);

		const byAdmin = await createList({
			actor: { role: 'admin' },
			groupId: group[0]!.id,
			title: 'Pour Léa',
			theme: 'anniversaire',
			eventDate: '',
			recipientId: lea[0]!.id
		});
		expect(byAdmin.ok).toBe(true);
		const refused = await createList({
			actor: { role: 'member', userId: alice[0]!.id },
			groupId: group[0]!.id,
			title: 'Interdit',
			theme: 'noel',
			eventDate: '',
			recipientId: ''
		});
		expect(refused.ok).toBe(false);

		const created = await createList({
			actor: { role: 'admin' },
			groupId: group[0]!.id,
			title: 'Noël 2026',
			theme: 'noel',
			eventDate: '2026-12-25',
			recipientId: ''
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const wish = await createWish({
			userId: alice[0]!.id,
			listId: created.id,
			title: 'Roman',
			url: 'https://www.exemple.be/roman',
			description: 'Broché',
			priority: 1,
			isSurprise: false
		});
		expect(wish.ok).toBe(true);
		if (!wish.ok) return;

		const own = await reserveWish(alice[0]!.id, wish.id);
		expect(own.ok).toBe(false);
		if (!own.ok) expect(own.message).toMatch(/propre souhait/);

		const taken = await reserveWish(marc[0]!.id, wish.id);
		expect(taken.ok).toBe(true);
		const again = await reserveWish(lea[0]!.id, wish.id);
		expect(again.ok).toBe(false);

		const ownerPage = await loadListPage(created.id, { role: 'member', userId: alice[0]!.id });
		const buyerPage = await loadListPage(created.id, { role: 'member', userId: marc[0]!.id });
		const otherPage = await loadListPage(created.id, { role: 'member', userId: lea[0]!.id });
		const adminPage = await loadListPage(created.id, { role: 'admin' });
		const stranger = await loadListPage(created.id, { role: 'member', userId: outsider[0]!.id });
		expect(stranger).toBeNull();
		expect(ownerPage?.wishes[0]?.card).toBe('rien');
		expect(reservationText('rien')).toBeNull();
		expect(ownerPage?.wishes[0]).not.toHaveProperty('taken');
		expect(ownerPage?.wishes[0]).not.toHaveProperty('buyer');
		expect(JSON.stringify(ownerPage?.wishes)).not.toContain('Marc');
		expect(ownerPage?.wishes[0]?.domain).toBe('exemple.be');

		expect(otherPage?.wishes[0]?.card).toBe('pris');
		expect(otherPage?.wishes[0]?.taken).toBe(true);
		expect(otherPage?.wishes[0]).not.toHaveProperty('buyer');
		expect(reservationText(otherPage!.wishes[0]!.card)).toBe('Déjà pris');
		expect(JSON.stringify(otherPage?.wishes)).not.toContain('Marc');
		expect(memberPayloadLeaks(otherPage!.wishes[0]!, lea[0]!.id)).toBe(false);

		expect(buyerPage?.wishes[0]?.card).toBe('mien');
		expect(buyerPage?.wishes[0]?.takenByMe).toBe(true);
		expect(buyerPage?.wishes[0]).not.toHaveProperty('buyer');
		expect(memberPayloadLeaks(buyerPage!.wishes[0]!, marc[0]!.id)).toBe(false);

		expect(adminPage?.wishes[0]?.buyer?.name).toBe('Marc');
		expect(adminPage?.canEdit).toBe(true);

		const ownerJson = await wishesPayload(created.id, { role: 'member', userId: alice[0]!.id });
		const otherJson = await wishesPayload(created.id, { role: 'member', userId: lea[0]!.id });
		const adminJson = await wishesPayload(created.id, { role: 'admin' });
		expect(JSON.stringify(ownerJson)).not.toMatch(/"taken"|"buyer"/);
		expect(JSON.stringify(otherJson)).not.toContain('Marc');
		expect(otherJson?.wishes[0]?.taken).toBe(true);
		expect(adminJson?.wishes[0]?.buyer?.name).toBe('Marc');

		const stolen = await cancelReservation(lea[0]!.id, wish.id);
		expect(stolen.ok).toBe(false);
		const undone = await cancelReservation(marc[0]!.id, wish.id);
		expect(undone.ok).toBe(true);
		const after = await loadListPage(created.id, { role: 'member', userId: lea[0]!.id });
		expect(after?.wishes[0]?.card).toBe('libre');
		expect(reservationText('libre')).toBeNull();
	});

	it('réserve une liste à une personne et masque le lien d’un souhait surprise', async () => {
		const alice = await getDb()
			.insert(appUser)
			.values({ displayName: 'Alice', loginName: 'alice-surprise', pinHash: 'x' })
			.returning();
		const marc = await getDb()
			.insert(appUser)
			.values({ displayName: 'Marc', loginName: 'marc-surprise', pinHash: 'x' })
			.returning();
		const group = await getDb().insert(appGroup).values({ name: 'Famille' }).returning();
		await getDb().insert(groupMember).values([
			{ groupId: group[0]!.id, userId: alice[0]!.id },
			{ groupId: group[0]!.id, userId: marc[0]!.id }
		]);
		const created = await createList({
			actor: { role: 'admin' },
			groupId: group[0]!.id,
			title: 'Anniversaire d’Alice',
			theme: 'anniversaire',
			eventDate: '',
			recipientId: alice[0]!.id
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const refused = await createWish({
			userId: marc[0]!.id,
			listId: created.id,
			title: 'Montre',
			url: '',
			description: '',
			priority: 2,
			isSurprise: false
		});
		expect(refused.ok).toBe(false);
		const surprise = await createWish({
			userId: alice[0]!.id,
			listId: created.id,
			title: 'Surprenez-moi',
			url: 'https://exemple.be/secret-indice',
			description: 'J’aime le vert',
			priority: 2,
			isSurprise: true
		});
		expect(surprise.ok).toBe(true);
		const seen = await wishesPayload(created.id, { role: 'member', userId: marc[0]!.id });
		expect(seen?.wishes[0]?.isSurprise).toBe(true);
		expect(seen?.wishes[0]?.url).toBeNull();
		expect(seen?.wishes[0]?.domain).toBeNull();
		expect(JSON.stringify(seen)).not.toContain('secret-indice');
		const mine = await loadListPage(created.id, { role: 'member', userId: alice[0]!.id });
		expect(mine?.wishes[0]?.url).toContain('secret-indice');
		expect(mine?.canAdd).toBe(true);
		const marcPage = await loadListPage(created.id, { role: 'member', userId: marc[0]!.id });
		expect(marcPage?.canAdd).toBe(false);
	});

	it('ignore un second envoi du même formulaire', async () => {
		const alice = await getDb()
			.insert(appUser)
			.values({ displayName: 'Alice', loginName: 'alice-double', pinHash: 'x' })
			.returning();
		const group = await getDb().insert(appGroup).values({ name: 'Famille' }).returning();
		await getDb().insert(groupMember).values({ groupId: group[0]!.id, userId: alice[0]!.id });
		const created = await createList({
			actor: { role: 'admin' },
			groupId: group[0]!.id,
			title: 'Noël',
			theme: 'noel',
			eventDate: '',
			recipientId: ''
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const key = '11111111-1111-4111-8111-111111111111';
		const first = await createWish({
			userId: alice[0]!.id,
			listId: created.id,
			title: 'Écharpe rouge',
			url: '',
			description: 'Douce',
			priority: 2,
			isSurprise: false,
			idempotencyKey: key
		});
		const second = await createWish({
			userId: alice[0]!.id,
			listId: created.id,
			title: 'Autre titre',
			url: 'https://exemple.be/autre',
			description: 'Ne doit pas être créé',
			priority: 1,
			isSurprise: false,
			idempotencyKey: key
		});
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(second.id).toBe(first.id);
		const page = await loadListPage(created.id, { role: 'member', userId: alice[0]!.id });
		expect(page?.wishes).toHaveLength(1);
		expect(page?.wishes[0]?.title).toBe('Écharpe rouge');
	});

	it('cache les parts d’un cadeau commun, sauf à l’organisateur et à l’admin', async () => {
		const alice = await getDb()
			.insert(appUser)
			.values({ displayName: 'Alice', loginName: 'alice-cagnotte', pinHash: 'x' })
			.returning();
		const marc = await getDb()
			.insert(appUser)
			.values({ displayName: 'Marc', loginName: 'marc-cagnotte', pinHash: 'x' })
			.returning();
		const paul = await getDb()
			.insert(appUser)
			.values({ displayName: 'Paul', loginName: 'paul-cagnotte', pinHash: 'x' })
			.returning();
		const group = await getDb().insert(appGroup).values({ name: 'Famille' }).returning();
		for (const user of [alice[0]!, marc[0]!, paul[0]!]) {
			await getDb().insert(groupMember).values({ groupId: group[0]!.id, userId: user.id });
		}
		const created = await createList({
			actor: { role: 'admin' },
			groupId: group[0]!.id,
			title: 'Anniversaire',
			theme: 'anniversaire',
			eventDate: '',
			recipientId: ''
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const gift = await createWish({
			userId: alice[0]!.id,
			listId: created.id,
			title: 'Week-end',
			url: '',
			description: '',
			priority: 2,
			isSurprise: false,
			isShared: true,
			target: '100'
		});
		expect(gift.ok).toBe(true);
		if (!gift.ok) return;
		const own = await pledge({ userId: alice[0]!.id, wishId: gift.id, mode: 'montant', euros: '10', fraction: '' });
		expect(own.ok).toBe(false);
		const reserved = await reserveWish(paul[0]!.id, gift.id);
		expect(reserved.ok).toBe(false);
		const part = await pledge({ userId: paul[0]!.id, wishId: gift.id, mode: 'part', euros: '', fraction: '1/4' });
		expect(part.ok).toBe(true);
		const viewer = { role: 'member' as const, userId: marc[0]!.id };
		const hidden = await wishesPayload(created.id, viewer);
		const seen = hidden?.wishes[0];
		expect(seen?.fundedPercent).toBe(25);
		expect(seen).not.toHaveProperty('participantCount');
		expect(seen).not.toHaveProperty('pledges');
		expect(JSON.stringify(seen)).not.toContain('Paul');
		expect(memberPayloadLeaks(seen!, marc[0]!.id)).toBe(false);
		const owner = await wishesPayload(created.id, { role: 'member', userId: alice[0]!.id });
		expect(owner?.wishes[0]).not.toHaveProperty('fundedPercent');
		expect(owner?.wishes[0]).not.toHaveProperty('pledges');
		expect(owner?.wishes[0]?.isShared).toBe(true);
		expect(owner?.wishes[0]?.targetAmountCents).toBe(10000);
		expect(JSON.stringify(owner?.wishes[0])).not.toContain('Paul');
		const done = await completeRest(marc[0]!.id, gift.id);
		expect(done.ok).toBe(true);
		const after = await loadListPage(created.id, viewer);
		expect(after?.wishes[0]?.isFunded).toBe(true);
		expect(after?.wishes[0]?.iOrganize).toBe(true);
		expect(after?.wishes[0]?.pledges?.map((item) => item.memberName).sort()).toEqual(['Marc', 'Paul']);
		const paulPage = await loadListPage(created.id, { role: 'member', userId: paul[0]!.id });
		expect(paulPage?.wishes[0]).not.toHaveProperty('pledges');
		expect(paulPage?.wishes[0]?.organizerName).toBe('Marc');
		expect(JSON.stringify(paulPage?.wishes[0]?.pledges ?? null)).not.toContain('Paul');
		expect(paulPage?.wishes[0]?.participantCount).toBe(2);
		const stillOwner = await wishesPayload(created.id, { role: 'member', userId: alice[0]!.id });
		expect(stillOwner?.wishes[0]).not.toHaveProperty('isFunded');
		expect(stillOwner?.wishes[0]).not.toHaveProperty('fundedPercent');
		expect(JSON.stringify(stillOwner)).not.toContain('Paul');
		expect(JSON.stringify(stillOwner)).not.toContain('Marc');
	});
});
