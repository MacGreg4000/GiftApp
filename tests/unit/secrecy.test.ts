import { describe, expect, it } from 'vitest';
import {
	fundingAggregates,
	memberPayloadLeaks,
	serializeWish,
	type ContributionRecord,
	type ReservationRecord,
	type WishRecord
} from '#lib/server/secrecy/dto';
import { listProgressForViewer } from '#lib/server/secrecy/progress';
import { reservationCard, reservationText } from '#lib/reservation-label';

const wish: WishRecord = {
	id: 'w1',
	listId: 'l1',
	ownerId: 'owner',
	title: 'Casque audio',
	url: 'https://exemple.be/casque',
	description: 'Noir',
	priority: 2,
	position: 0,
	isSurprise: false,
	isShared: false,
	targetAmountCents: null,
	fundedAt: null,
	organizerId: null,
	purchasedAt: null
};

const reservation: ReservationRecord = {
	buyerId: 'buyer',
	buyerName: 'Julie',
	status: 'reserve',
	buyerNote: 'pris en magasin',
	wishUpdatedAfter: false,
	createdAt: '2026-11-12T10:00:00Z'
};

describe('secret d’achat', () => {
	it('ne montre rien au propriétaire, même pas le booléen pris', () => {
		const dto = serializeWish(wish, reservation, [], { role: 'member', userId: 'owner' });
		expect(dto).not.toHaveProperty('taken');
		expect(dto).not.toHaveProperty('buyer');
		expect(dto).not.toHaveProperty('fundedPercent');
		expect(JSON.stringify(dto)).not.toContain('Julie');
		expect(JSON.stringify(dto)).not.toContain('buyer');
		expect(reservationCard(dto)).toBe('rien');
		expect(reservationText('rien')).toBeNull();
	});

	it('dit à un autre membre que c’est pris, jamais par qui', () => {
		const dto = serializeWish(wish, reservation, [], { role: 'member', userId: 'paul' });
		expect(dto.taken).toBe(true);
		expect(dto.takenByMe).toBe(false);
		expect(dto).not.toHaveProperty('buyer');
		expect(dto).not.toHaveProperty('status');
		expect(memberPayloadLeaks(dto, 'paul')).toBe(false);
		expect(JSON.stringify(dto)).not.toContain('Julie');
		expect(reservationCard(dto)).toBe('pris');
		expect(reservationText('pris')).toBe('Déjà pris');
	});

	it('donne à l’acheteur sa note et son statut, sans l’identité des autres', () => {
		const dto = serializeWish(wish, reservation, [], { role: 'member', userId: 'buyer' });
		expect(dto.takenByMe).toBe(true);
		expect(dto.status).toBe('reserve');
		expect(dto.buyerNote).toBe('pris en magasin');
		expect(dto).not.toHaveProperty('buyer');
	});

	it('montre l’acheteur à l’admin', () => {
		const dto = serializeWish(wish, reservation, [], { role: 'admin' });
		expect(dto.buyer).toEqual({ id: 'buyer', name: 'Julie' });
	});
});

describe('cadeaux communs', () => {
	const shared: WishRecord = {
		...wish,
		isShared: true,
		targetAmountCents: 10000,
		organizerId: 'orga'
	};
	const contributions: ContributionRecord[] = [
		{ memberId: 'orga', memberName: 'Marc', amountCents: 5000, fractionNum: null, fractionDen: null },
		{ memberId: 'paul', memberName: 'Paul', amountCents: null, fractionNum: 1, fractionDen: 4 }
	];

	it('calcule le total sans exposer les lignes à un simple membre', () => {
		const totals = fundingAggregates(shared, contributions);
		expect(totals.fundedTotalCents).toBe(7500);
		expect(totals.fundedPercent).toBe(75);
		const dto = serializeWish(shared, null, contributions, { role: 'member', userId: 'camille' }, 'Marc');
		expect(dto.fundedPercent).toBe(75);
		expect(dto.participantCount).toBe(2);
		expect(dto).not.toHaveProperty('pledges');
		expect(JSON.stringify(dto)).not.toContain('Paul');
		expect(memberPayloadLeaks(dto, 'camille')).toBe(false);
	});

	it('masque le nombre de participants tant qu’il n’y en a qu’un', () => {
		const dto = serializeWish(shared, null, [contributions[0]!], { role: 'member', userId: 'camille' });
		expect(dto).not.toHaveProperty('participantCount');
	});

	it('montre les promesses à l’organisateur et à l’admin seulement', () => {
		const organizer = serializeWish(shared, null, contributions, { role: 'member', userId: 'orga' }, 'Marc');
		expect(organizer.pledges?.map((item) => item.memberName)).toEqual(['Marc', 'Paul']);
		const admin = serializeWish(shared, null, contributions, { role: 'admin' }, 'Marc');
		expect(admin.pledges).toHaveLength(2);
		const owner = serializeWish(shared, null, contributions, { role: 'member', userId: 'owner' });
		expect(owner).not.toHaveProperty('pledges');
		expect(owner).not.toHaveProperty('fundedPercent');
		expect(owner).not.toHaveProperty('isFunded');
		expect(owner.isShared).toBe(true);
		expect(owner.targetAmountCents).toBe(10000);
	});
});

describe('barre de progression de la liste', () => {
	it('exclut les souhaits du visiteur pour ne pas trahir les siens', () => {
		const progress = listProgressForViewer(
			[
				{ id: '1', listId: 'l', ownerId: 'me', taken: true },
				{ id: '2', listId: 'l', ownerId: 'me', taken: false },
				{ id: '3', listId: 'l', ownerId: 'other', taken: true },
				{ id: '4', listId: 'l', ownerId: 'other', taken: false }
			],
			'me'
		);
		expect(progress).toEqual({ taken: 1, total: 2 });
		expect(listProgressForViewer([{ id: '1', listId: 'l', ownerId: 'me', taken: true }], 'me')).toBeNull();
	});
});
