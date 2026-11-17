import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '#lib/server/db/client';
import { resetMigrationFlag, runMigrations } from '#lib/server/db/migrate';
import { appGroup, appUser, groupMember, loginAttempt, reservation, wish, wishList } from '#lib/server/db/schema';
import { hashPin } from '#lib/server/auth/crypto';
import { loginWithPin } from '#lib/server/auth/login';
import { unlockMember } from '#lib/server/admin/manage';
import { resetSetupCache } from '#lib/server/setup';
import { getConfig } from '#lib/server/config';

process.env.DATABASE_URL ??=
	'postgres://wishlist:wishlist-dev-password@127.0.0.1:54329/wishlist';
process.env.LOGIN_DELAY_SCALE ??= '0';

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

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

function errorText(error: unknown): string {
	if (!error) return '';
	if (error instanceof Error) {
		const cause = (error as { cause?: unknown }).cause;
		return `${error.message} ${errorText(cause)}`;
	}
	return String(error);
}

describeDb('authentification et gardes SQL', () => {
	beforeAll(async () => {
		process.env.LOGIN_DELAY_SCALE = '0';
		resetMigrationFlag();
		await runMigrations();
	});

	beforeEach(async () => {
		await truncate();
	});

	afterAll(async () => {
		await closeDb();
	});

	it('connecte un membre par prénom et code, sans distinguer un prénom inconnu', async () => {
		const pin = '847291';
		const pinHash = await hashPin(pin, getConfig().pinPepper);
		await getDb().insert(appUser).values({ displayName: 'Lucie', loginName: 'lucie', pinHash });
		const ok = await loginWithPin({
			loginName: 'Lucie',
			pin,
			ip: '203.0.113.10',
			userAgent: 'vitest'
		});
		expect(ok.ok).toBe(true);
		if (ok.ok) expect(ok.user.displayName).toBe('Lucie');

		const unknown = await loginWithPin({
			loginName: 'Personne',
			pin: '847291',
			ip: '203.0.113.11',
			userAgent: null
		});
		const wrong = await loginWithPin({
			loginName: 'Lucie',
			pin: '847292',
			ip: '203.0.113.12',
			userAgent: null
		});
		expect(unknown.ok).toBe(false);
		expect(wrong.ok).toBe(false);
		if (!unknown.ok && !wrong.ok) expect(unknown.message).toBe(wrong.message);
	});

	it('verrouille le compte au cinquième échec, puis l’admin le débloque', async () => {
		const pin = '847291';
		const pinHash = await hashPin(pin, getConfig().pinPepper);
		const created = await getDb()
			.insert(appUser)
			.values({ displayName: 'Noah', loginName: 'noah', pinHash })
			.returning({ id: appUser.id });
		let last = await loginWithPin({ loginName: 'Noah', pin: '101010', ip: '203.0.113.40', userAgent: null });
		for (let i = 0; i < 4; i++) {
			last = await loginWithPin({ loginName: 'Noah', pin: '202020', ip: '203.0.113.40', userAgent: null });
		}
		expect(last.ok).toBe(false);
		if (!last.ok) expect(last.message).toMatch(/temporairement/);
		const still = await loginWithPin({ loginName: 'Noah', pin, ip: '203.0.113.41', userAgent: null });
		expect(still.ok).toBe(false);
		if (!still.ok) expect(still.code).toBe('account_temporary');
		await unlockMember(created[0]!.id);
		const again = await loginWithPin({ loginName: 'Noah', pin, ip: '203.0.113.42', userAgent: null });
		expect(again.ok).toBe(true);
	});

	it('bloque une adresse après 10 échecs', async () => {
		for (let i = 0; i < 10; i++) {
			await loginWithPin({
				loginName: 'inconnu',
				pin: '394857',
				ip: '198.51.100.8',
				userAgent: null
			});
		}
		const blocked = await loginWithPin({
			loginName: 'inconnu',
			pin: '394857',
			ip: '198.51.100.8',
			userAgent: null
		});
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) expect(blocked.code).toBe('ip_locked');
	});

	it('suspend les nouvelles connexions au-delà de 200 échecs dans l’heure', async () => {
		await getDb().insert(loginAttempt).values(
			Array.from({ length: 201 }, () => ({
				kind: 'pin' as const,
				ip: '192.0.2.20',
				success: false
			}))
		);
		const result = await loginWithPin({
			loginName: 'Lucie',
			pin: '847291',
			ip: '192.0.2.21',
			userAgent: null
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('global_suspended');
	});

	it('interdit de réserver son propre souhait ou un cadeau commun, et de cotiser au sien', async () => {
		const owner = await getDb()
			.insert(appUser)
			.values({ displayName: 'Sophie', loginName: 'sophie', pinHash: 'x' })
			.returning();
		const buyer = await getDb()
			.insert(appUser)
			.values({ displayName: 'Marc', loginName: 'marc', pinHash: 'x' })
			.returning();
		const outsider = await getDb()
			.insert(appUser)
			.values({ displayName: 'Léa', loginName: 'lea', pinHash: 'x' })
			.returning();
		const group = await getDb().insert(appGroup).values({ name: 'Famille' }).returning();
		await getDb().insert(groupMember).values([
			{ groupId: group[0]!.id, userId: owner[0]!.id },
			{ groupId: group[0]!.id, userId: buyer[0]!.id }
		]);
		await expect(
			getDb().insert(wishList).values({
				groupId: group[0]!.id,
				title: 'Anniversaire',
				recipientId: outsider[0]!.id
			})
		).rejects.toSatisfy((error: unknown) => /recipient_not_member/.test(errorText(error)));

		const list = await getDb()
			.insert(wishList)
			.values({ groupId: group[0]!.id, title: 'Noël', theme: 'noel' })
			.returning();
		const own = await getDb()
			.insert(wish)
			.values({ listId: list[0]!.id, ownerId: owner[0]!.id, title: 'Livre' })
			.returning();
		await expect(
			getDb().insert(reservation).values({ wishId: own[0]!.id, buyerId: owner[0]!.id })
		).rejects.toSatisfy((error: unknown) => /cannot_reserve_own_wish/.test(errorText(error)));
		await getDb().insert(reservation).values({ wishId: own[0]!.id, buyerId: buyer[0]!.id });

		const shared = await getDb()
			.insert(wish)
			.values({
				listId: list[0]!.id,
				ownerId: owner[0]!.id,
				title: 'Vélo',
				isShared: true,
				targetAmountCents: 10000
			})
			.returning();
		await expect(
			getDb().insert(reservation).values({ wishId: shared[0]!.id, buyerId: buyer[0]!.id })
		).rejects.toSatisfy((error: unknown) => /shared_wish_not_reservable/.test(errorText(error)));
		const { contribution } = await import('#lib/server/db/schema');
		await expect(
			getDb().insert(contribution).values({
				wishId: shared[0]!.id,
				memberId: owner[0]!.id,
				amountCents: 1000
			})
		).rejects.toSatisfy((error: unknown) => /owner_cannot_contribute/.test(errorText(error)));
		await getDb().insert(contribution).values({
			wishId: shared[0]!.id,
			memberId: buyer[0]!.id,
			amountCents: 2500
		});
	});
});
