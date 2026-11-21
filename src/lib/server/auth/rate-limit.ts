export const FIFTEEN_MIN = 15 * 60 * 1000;
export const ACCOUNT_LOCK_DURATIONS = [FIFTEEN_MIN, 60 * 60 * 1000, 6 * 60 * 60 * 1000];
export const IP_LOCK_DURATIONS = [FIFTEEN_MIN, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
export const ADMIN_IP_LOCK_DURATIONS = [30 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

export type AccountLockState = {
	failedPinCount: number;
	lockLevel: number;
	lockedUntil: Date | null;
};

export type IpLockState = {
	failCount: number;
	windowStartedAt: Date | null;
	lockLevel: number;
	lockedUntil: Date | null;
	lastFailureAt: Date | null;
};

export function accountIsLocked(state: AccountLockState, now: Date): boolean {
	if (state.lockLevel >= 4) return true;
	return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function accountOnSuccess(): AccountLockState {
	return { failedPinCount: 0, lockLevel: 0, lockedUntil: null };
}

/** 5 échecs consécutifs : 15 min, puis 1 h, puis 6 h, puis blocage jusqu’à l’admin. */
export function accountOnFailure(
	state: AccountLockState,
	now: Date
): { state: AccountLockState; event: 'none' | 'locked' | 'permanent' } {
	const failedPinCount = state.failedPinCount + 1;
	if (failedPinCount < 5) {
		return {
			state: { ...state, failedPinCount, lockedUntil: state.lockedUntil },
			event: 'none'
		};
	}
	const lockLevel = state.lockLevel + 1;
	if (lockLevel >= 4) {
		return {
			state: { failedPinCount: 0, lockLevel, lockedUntil: null },
			event: 'permanent'
		};
	}
	const duration = ACCOUNT_LOCK_DURATIONS[lockLevel - 1] ?? ACCOUNT_LOCK_DURATIONS[2]!;
	return {
		state: {
			failedPinCount: 0,
			lockLevel,
			lockedUntil: new Date(now.getTime() + duration)
		},
		event: 'locked'
	};
}

export function ipIsLocked(state: IpLockState, now: Date): boolean {
	return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function ipOnFailure(
	state: IpLockState,
	now: Date,
	options: { threshold: number; windowMs: number; durations: number[] }
): { state: IpLockState; locked: boolean } {
	let lockLevel = state.lockLevel;
	if (state.lastFailureAt && now.getTime() - state.lastFailureAt.getTime() > 24 * 60 * 60 * 1000) {
		lockLevel = 0;
	}
	let failCount = state.failCount;
	let windowStartedAt = state.windowStartedAt;
	if (!windowStartedAt || now.getTime() - windowStartedAt.getTime() > options.windowMs) {
		windowStartedAt = now;
		failCount = 1;
	} else {
		failCount += 1;
	}
	let lockedUntil = state.lockedUntil && state.lockedUntil.getTime() > now.getTime() ? state.lockedUntil : null;
	let locked = false;
	if (failCount >= options.threshold) {
		lockLevel = Math.min(lockLevel + 1, options.durations.length);
		const duration = options.durations[lockLevel - 1] ?? options.durations.at(-1)!;
		lockedUntil = new Date(now.getTime() + duration);
		failCount = 0;
		windowStartedAt = null;
		locked = true;
	}
	return {
		state: {
			failCount,
			windowStartedAt,
			lockLevel,
			lockedUntil,
			lastFailureAt: now
		},
		locked
	};
}

export function ipOnSuccess(state: IpLockState): IpLockState {
	return { ...state, failCount: 0, windowStartedAt: null };
}

export function globalPinPolicy(
	failuresLastHour: number,
	now: Date,
	suspendedUntil: Date | null
): { blocked: boolean; delayMs: number; alert: boolean; suspend: boolean; suspendedUntil: Date | null } {
	if (suspendedUntil && suspendedUntil.getTime() > now.getTime()) {
		return { blocked: true, delayMs: 0, alert: false, suspend: false, suspendedUntil };
	}
	if (failuresLastHour > 200) {
		const until = new Date(now.getTime() + 60 * 60 * 1000);
		return { blocked: true, delayMs: 0, alert: true, suspend: true, suspendedUntil: until };
	}
	if (failuresLastHour > 50) {
		return { blocked: false, delayMs: 3000, alert: true, suspend: false, suspendedUntil: null };
	}
	return { blocked: false, delayMs: 0, alert: false, suspend: false, suspendedUntil: null };
}

export function remainingLabel(until: Date, now: Date): string {
	const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
	if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
	const hours = Math.max(1, Math.ceil(minutes / 60));
	return `${hours} heure${hours > 1 ? 's' : ''}`;
}
