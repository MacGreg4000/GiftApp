import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, noticeText, recipients, type NotifyPrefs } from '#lib/notify-copy';
import { endpointShapeProblem } from '#lib/server/push';

const members = (prefs: NotifyPrefs = DEFAULT_PREFS) => [
	{ id: 'owner', prefs },
	{ id: 'other', prefs },
	{ id: 'quiet', prefs: { ...DEFAULT_PREFS, new_list: false, shared_funded: false, event_reminder: false, new_wish: false } }
];

describe('textes de notification', () => {
	it('ne cite ni un acheteur, ni un montant, ni une réservation', () => {
		const samples = [
			noticeText({ kind: 'new_list', listId: 'l', listTitle: 'Noël' }),
			noticeText({ kind: 'new_wish', listId: 'l', wishId: 'w', listTitle: 'Noël' }),
			noticeText({ kind: 'shared_funded', listId: 'l', wishId: 'w', listTitle: 'Noël', wishTitle: 'Week-end' }),
			noticeText({ kind: 'event_reminder', listId: 'l', listTitle: 'Noël', days: 7 })
		];
		for (const sample of samples) {
			expect(sample.body).not.toMatch(/€|pris par|réserv|participe|organisé/i);
			expect(sample.url.startsWith('/')).toBe(true);
		}
		expect(samples[2]?.body).toBe('« Week-end » est financé.');
		expect(samples[1]?.refId).toBe('w');
	});
});

describe('destinataires', () => {
	it('n’écrit jamais au propriétaire pour un souhait ou une cagnotte', () => {
		const funded = recipients({ kind: 'shared_funded', members: members(), ownerId: 'owner' });
		expect(funded).toEqual(['other']);
		expect(funded).not.toContain('owner');
		const wish = recipients({ kind: 'new_wish', members: members(), actorId: 'owner', ownerId: 'owner' });
		expect(wish).toEqual([]);
		const opted = recipients({
			kind: 'new_wish',
			members: members({ ...DEFAULT_PREFS, new_wish: true }),
			actorId: 'owner',
			ownerId: 'owner'
		});
		expect(opted).toEqual(['other']);
	});

	it('prévient le groupe d’une nouvelle liste, sauf l’auteur', () => {
		expect(recipients({ kind: 'new_list', members: members(), actorId: 'owner' })).toEqual(['other']);
	});

	it('rappelle tout le monde, y compris les propriétaires de souhaits, sans parler des réservations', () => {
		expect(recipients({ kind: 'event_reminder', members: members() })).toEqual(['owner', 'other']);
	});
});

describe('point de terminaison push', () => {
	it('refuse les adresses locales et le http', () => {
		expect(endpointShapeProblem('http://example.com/push')).toBeTruthy();
		expect(endpointShapeProblem('https://127.0.0.1/push')).toBeTruthy();
		expect(endpointShapeProblem('https://localhost/push')).toBeTruthy();
		expect(endpointShapeProblem('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBeNull();
	});
});
