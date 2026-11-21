import { describe, expect, it } from 'vitest';
import {
	ACCOUNT_LOCK_DURATIONS,
	accountIsLocked,
	accountOnFailure,
	accountOnSuccess,
	ADMIN_IP_LOCK_DURATIONS,
	FIFTEEN_MIN,
	globalPinPolicy,
	IP_LOCK_DURATIONS,
	ipIsLocked,
	ipOnFailure,
	type AccountLockState,
	type IpLockState
} from '#lib/server/auth/rate-limit';

const now = new Date('2026-11-17T12:00:00Z');

function account(): AccountLockState {
	return { failedPinCount: 0, lockLevel: 0, lockedUntil: null };
}

function ip(): IpLockState {
	return { failCount: 0, windowStartedAt: null, lockLevel: 0, lockedUntil: null, lastFailureAt: null };
}

describe('verrouillage du compte', () => {
	it('bloque 15 minutes au 5e échec, puis 1 h, 6 h, puis définitivement', () => {
		let state = account();
		for (let cycle = 0; cycle < 3; cycle++) {
			let event: string = 'none';
			for (let i = 0; i < 5; i++) {
				const next = accountOnFailure(state, now);
				state = next.state;
				event = next.event;
			}
			expect(event).toBe('locked');
			expect(state.lockedUntil?.getTime()).toBe(now.getTime() + ACCOUNT_LOCK_DURATIONS[cycle]!);
			expect(accountIsLocked(state, now)).toBe(true);
			expect(accountIsLocked(state, new Date(state.lockedUntil!.getTime() + 1))).toBe(false);
			state = { ...state, lockedUntil: null };
		}
		let event = 'none';
		for (let i = 0; i < 5; i++) {
			const next = accountOnFailure(state, now);
			state = next.state;
			event = next.event;
		}
		expect(event).toBe('permanent');
		expect(state.lockLevel).toBe(4);
		expect(accountIsLocked(state, new Date('2099-01-01'))).toBe(true);
	});

	it('remet le compte à zéro après un succès', () => {
		const reset = accountOnSuccess();
		expect(accountIsLocked(reset, now)).toBe(false);
		expect(reset.failedPinCount).toBe(0);
	});
});

describe('verrouillage par IP', () => {
	it('bloque après 10 échecs en 15 minutes, puis allonge la peine', () => {
		let state = ip();
		let locked = false;
		for (let i = 0; i < 10; i++) {
			const next = ipOnFailure(state, now, {
				threshold: 10,
				windowMs: FIFTEEN_MIN,
				durations: IP_LOCK_DURATIONS
			});
			state = next.state;
			locked = next.locked;
		}
		expect(locked).toBe(true);
		expect(state.lockedUntil?.getTime()).toBe(now.getTime() + IP_LOCK_DURATIONS[0]!);
		expect(ipIsLocked(state, now)).toBe(true);
		const later = new Date(state.lockedUntil!.getTime() + 1000);
		state = { ...state, lockedUntil: null, failCount: 0, windowStartedAt: null };
		for (let i = 0; i < 10; i++) {
			const next = ipOnFailure(state, later, {
				threshold: 10,
				windowMs: FIFTEEN_MIN,
				durations: IP_LOCK_DURATIONS
			});
			state = next.state;
		}
		expect(state.lockLevel).toBe(2);
		expect(state.lockedUntil?.getTime()).toBe(later.getTime() + IP_LOCK_DURATIONS[1]!);
	});

	it('compte 5 échecs admin sur une fenêtre de 15 minutes', () => {
		let state = ip();
		for (let i = 0; i < 5; i++) {
			state = ipOnFailure(state, now, {
				threshold: 5,
				windowMs: FIFTEEN_MIN,
				durations: ADMIN_IP_LOCK_DURATIONS
			}).state;
		}
		expect(state.lockedUntil?.getTime()).toBe(now.getTime() + ADMIN_IP_LOCK_DURATIONS[0]!);
	});
});

describe('limite globale', () => {
	it('ralentit au-delà de 50 échecs et suspend au-delà de 200', () => {
		expect(globalPinPolicy(50, now, null).delayMs).toBe(0);
		expect(globalPinPolicy(51, now, null)).toMatchObject({ delayMs: 3000, alert: true, blocked: false });
		const hard = globalPinPolicy(201, now, null);
		expect(hard.blocked).toBe(true);
		expect(hard.suspendedUntil?.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
		const still = globalPinPolicy(0, new Date(now.getTime() + 1000), hard.suspendedUntil);
		expect(still.blocked).toBe(true);
	});
});
