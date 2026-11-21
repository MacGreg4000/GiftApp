import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { adminAccount, appUser, ipLock, loginAttempt, securityState } from '../db/schema';
import { audit } from './audit';
import {
	decryptString,
	dummyHash,
	matchRecoveryCode,
	normalizeRecovery,
	verifyPassword,
	verifyPinOrDummy
} from './crypto';
import { getConfig } from '../config';
import { foldName, normalizePin } from './pin';
import {
	ADMIN_IP_LOCK_DURATIONS,
	accountIsLocked,
	accountOnFailure,
	accountOnSuccess,
	FIFTEEN_MIN,
	globalPinPolicy,
	IP_LOCK_DURATIONS,
	ipIsLocked,
	ipOnFailure,
	ipOnSuccess,
	remainingLabel,
	type AccountLockState,
	type IpLockState
} from './rate-limit';
import { createSession } from './session';
import { verifyTotp } from './totp';

const INVALID = 'Prénom ou code incorrect.';
const ADMIN_INVALID = 'Identifiants incorrects.';

let dummyPin: string | null = null;
let dummyPassword: string | null = null;

export async function initAuthHashes() {
	if (!dummyPin) dummyPin = await dummyHash();
	if (!dummyPassword) dummyPassword = await dummyHash();
}

function delayScale(): number {
	const raw = Number(process.env.LOGIN_DELAY_SCALE ?? '1');
	return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

async function sleep(ms: number) {
	const scaled = Math.round(ms * delayScale());
	if (scaled <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, scaled));
}

function pinSlice(row: typeof ipLock.$inferSelect | undefined): IpLockState {
	if (!row) {
		return { failCount: 0, windowStartedAt: null, lockLevel: 0, lockedUntil: null, lastFailureAt: null };
	}
	return {
		failCount: row.pinFailCount,
		windowStartedAt: row.pinWindowStartedAt,
		lockLevel: row.pinLockLevel,
		lockedUntil: row.pinLockedUntil,
		lastFailureAt: row.pinLastFailureAt
	};
}

function adminSlice(row: typeof ipLock.$inferSelect | undefined): IpLockState {
	if (!row) {
		return { failCount: 0, windowStartedAt: null, lockLevel: 0, lockedUntil: null, lastFailureAt: null };
	}
	return {
		failCount: row.adminFailCount,
		windowStartedAt: row.adminWindowStartedAt,
		lockLevel: row.adminLockLevel,
		lockedUntil: row.adminLockedUntil,
		lastFailureAt: row.adminLastFailureAt
	};
}

async function loadIp(ip: string) {
	const rows = await getDb().select().from(ipLock).where(eq(ipLock.ip, ip)).limit(1);
	return rows[0];
}

async function savePinIp(ip: string, state: IpLockState) {
	await getDb()
		.insert(ipLock)
		.values({
			ip,
			pinFailCount: state.failCount,
			pinWindowStartedAt: state.windowStartedAt,
			pinLockLevel: state.lockLevel,
			pinLockedUntil: state.lockedUntil,
			pinLastFailureAt: state.lastFailureAt
		})
		.onConflictDoUpdate({
			target: ipLock.ip,
			set: {
				pinFailCount: state.failCount,
				pinWindowStartedAt: state.windowStartedAt,
				pinLockLevel: state.lockLevel,
				pinLockedUntil: state.lockedUntil,
				pinLastFailureAt: state.lastFailureAt
			}
		});
}

async function saveAdminIp(ip: string, state: IpLockState) {
	await getDb()
		.insert(ipLock)
		.values({
			ip,
			adminFailCount: state.failCount,
			adminWindowStartedAt: state.windowStartedAt,
			adminLockLevel: state.lockLevel,
			adminLockedUntil: state.lockedUntil,
			adminLastFailureAt: state.lastFailureAt
		})
		.onConflictDoUpdate({
			target: ipLock.ip,
			set: {
				adminFailCount: state.failCount,
				adminWindowStartedAt: state.windowStartedAt,
				adminLockLevel: state.lockLevel,
				adminLockedUntil: state.lockedUntil,
				adminLastFailureAt: state.lastFailureAt
			}
		});
}

async function recordAttempt(input: {
	kind: 'pin' | 'admin';
	ip: string;
	userId: string | null;
	success: boolean;
	now: Date;
}) {
	await getDb().insert(loginAttempt).values({
		kind: input.kind,
		ip: input.ip,
		userId: input.userId,
		success: input.success,
		at: input.now
	});
}

async function pinFailuresLastHour(now: Date): Promise<number> {
	const since = new Date(now.getTime() - 60 * 60 * 1000);
	const rows = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(loginAttempt)
		.where(and(eq(loginAttempt.kind, 'pin'), eq(loginAttempt.success, false), gte(loginAttempt.at, since)));
	return Number(rows[0]?.count ?? 0);
}

async function suspendedUntil(): Promise<Date | null> {
	const rows = await getDb()
		.select()
		.from(securityState)
		.where(eq(securityState.key, 'pin_suspended_until'))
		.limit(1);
	return rows[0]?.until ?? null;
}

async function setSuspended(until: Date | null) {
	await getDb()
		.insert(securityState)
		.values({ key: 'pin_suspended_until', until, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: securityState.key,
			set: { until, updatedAt: new Date() }
		});
}

async function auditOnce(action: string, now: Date, details: Record<string, unknown>) {
	const bucket = `${action}:${now.toISOString().slice(0, 13)}`;
	const rows = await getDb().select().from(securityState).where(eq(securityState.key, bucket)).limit(1);
	if (rows[0]) return;
	await getDb().insert(securityState).values({ key: bucket, note: action, updatedAt: now });
	await audit({ actor: 'system', action, details });
}

async function applyGlobal(now: Date) {
	const count = await pinFailuresLastHour(now);
	const policy = globalPinPolicy(count, now, await suspendedUntil());
	if (policy.suspend && policy.suspendedUntil) {
		await setSuspended(policy.suspendedUntil);
		await auditOnce('auth.global_suspend', now, { count });
	} else if (policy.alert) {
		await auditOnce('auth.global_alert', now, { count });
	}
	return policy;
}

export type PinLoginResult =
	| {
			ok: true;
			token: string;
			user: { id: string; displayName: string; loginName: string };
	  }
	| { ok: false; code: string; message: string };

export async function loginWithPin(input: {
	loginName: string;
	pin: string;
	ip: string;
	userAgent: string | null;
	now?: Date;
}): Promise<PinLoginResult> {
	await initAuthHashes();
	const now = input.now ?? new Date();
	const config = getConfig();
	const suspend = await suspendedUntil();
	const recent = await pinFailuresLastHour(now);
	const prePolicy = globalPinPolicy(recent, now, suspend);
	if (prePolicy.blocked) {
		if (prePolicy.suspend && prePolicy.suspendedUntil) {
			await setSuspended(prePolicy.suspendedUntil);
			await auditOnce('auth.global_suspend', now, { count: recent });
		}
		return {
			ok: false,
			code: 'global_suspended',
			message:
				'Les nouvelles connexions sont suspendues pendant une heure en raison d’un nombre inhabituel de tentatives. Les personnes déjà connectées ne sont pas concernées.'
		};
	}
	if (prePolicy.delayMs) await sleep(prePolicy.delayMs);
	if (prePolicy.alert) await auditOnce('auth.global_alert', now, { count: recent });

	const ipRow = await loadIp(input.ip);
	const ipState = pinSlice(ipRow);
	if (ipIsLocked(ipState, now) && ipState.lockedUntil) {
		return {
			ok: false,
			code: 'ip_locked',
			message: `Trop de tentatives depuis cette adresse. Réessayez dans ${remainingLabel(ipState.lockedUntil, now)}.`
		};
	}

	const folded = foldName(input.loginName).replace(/\s+/g, '');
	const pin = normalizePin(input.pin);
	const users = folded
		? await getDb().select().from(appUser).where(eq(appUser.loginName, folded)).limit(1)
		: [];
	const user = users[0] ?? null;
	const matches = await verifyPinOrDummy(
		user?.pinHash ?? null,
		pin.length === 6 ? pin : '000000',
		config.pinPepper,
		dummyPin!
	);
	const pinOk = pin.length === 6 && matches;

	if (!user || !user.isActive || !pinOk) {
		await recordAttempt({ kind: 'pin', ip: input.ip, userId: user?.id ?? null, success: false, now });
		if (user && user.isActive && accountIsLocked(userState(user), now)) {
			const nextIp = ipOnFailure(ipState, now, {
				threshold: 10,
				windowMs: FIFTEEN_MIN,
				durations: IP_LOCK_DURATIONS
			});
			await savePinIp(input.ip, nextIp.state);
			await applyGlobal(now);
			return lockedAccountMessage(userState(user), now);
		}
		if (user && user.isActive) {
			const next = accountOnFailure(userState(user), now);
			await getDb()
				.update(appUser)
				.set({
					failedPinCount: next.state.failedPinCount,
					lockLevel: next.state.lockLevel,
					lockedUntil: next.state.lockedUntil
				})
				.where(eq(appUser.id, user.id));
			if (next.event === 'permanent') {
				await audit({
					actor: 'system',
					action: 'auth.lockout.account',
					targetId: user.id,
					details: { permanent: true }
				});
			} else if (next.event === 'locked') {
				await audit({
					actor: 'system',
					action: 'auth.lockout.account',
					targetId: user.id,
					details: { level: next.state.lockLevel }
				});
			}
			const nextIp = ipOnFailure(ipState, now, {
				threshold: 10,
				windowMs: FIFTEEN_MIN,
				durations: IP_LOCK_DURATIONS
			});
			await savePinIp(input.ip, nextIp.state);
			if (nextIp.locked) {
				await audit({ actor: 'system', action: 'auth.lockout.ip', details: { level: nextIp.state.lockLevel } });
			}
			const global = await applyGlobal(now);
			if (global.blocked) {
				return {
					ok: false,
					code: 'global_suspended',
					message:
						'Les nouvelles connexions sont suspendues pendant une heure en raison d’un nombre inhabituel de tentatives.'
				};
			}
			if (accountIsLocked(next.state, now)) return lockedAccountMessage(next.state, now);
			return { ok: false, code: 'invalid', message: INVALID };
		}
		const nextIp = ipOnFailure(ipState, now, {
			threshold: 10,
			windowMs: FIFTEEN_MIN,
			durations: IP_LOCK_DURATIONS
		});
		await savePinIp(input.ip, nextIp.state);
		await applyGlobal(now);
		return { ok: false, code: 'invalid', message: INVALID };
	}

	if (accountIsLocked(userState(user), now)) {
		await recordAttempt({ kind: 'pin', ip: input.ip, userId: user.id, success: false, now });
		return lockedAccountMessage(userState(user), now);
	}

	const reset = accountOnSuccess();
	await getDb()
		.update(appUser)
		.set({
			failedPinCount: reset.failedPinCount,
			lockLevel: reset.lockLevel,
			lockedUntil: reset.lockedUntil,
			lastLoginAt: now
		})
		.where(eq(appUser.id, user.id));
	await savePinIp(input.ip, ipOnSuccess(ipState));
	await recordAttempt({ kind: 'pin', ip: input.ip, userId: user.id, success: true, now });
	const token = await createSession({
		userId: user.id,
		isAdmin: false,
		ip: input.ip,
		userAgent: input.userAgent,
		now
	});
	return {
		ok: true,
		token,
		user: { id: user.id, displayName: user.displayName, loginName: user.loginName }
	};
}

function userState(user: {
	failedPinCount: number;
	lockLevel: number;
	lockedUntil: Date | null;
}): AccountLockState {
	return {
		failedPinCount: user.failedPinCount,
		lockLevel: user.lockLevel,
		lockedUntil: user.lockedUntil
	};
}

function lockedAccountMessage(state: AccountLockState, now: Date): PinLoginResult {
	if (state.lockLevel >= 4) {
		return {
			ok: false,
			code: 'account_permanent',
			message: 'Ce compte est bloqué. Demandez à l’organisateur de le débloquer.'
		};
	}
	const until = state.lockedUntil;
	const delay = until ? remainingLabel(until, now) : 'quelques minutes';
	return {
		ok: false,
		code: 'account_temporary',
		message: `Ce compte est temporairement bloqué. Réessayez dans ${delay}, ou demandez à l’organisateur.`
	};
}

export type AdminLoginResult =
	| { ok: true; token: string; username: string }
	| { ok: false; message: string };

export async function loginAdmin(input: {
	username: string;
	password: string;
	code: string;
	ip: string;
	userAgent: string | null;
	now?: Date;
}): Promise<AdminLoginResult> {
	await initAuthHashes();
	const now = input.now ?? new Date();
	const config = getConfig();
	const ipRow = await loadIp(input.ip);
	const ipState = adminSlice(ipRow);
	if (ipIsLocked(ipState, now) && ipState.lockedUntil) {
		return {
			ok: false,
			message: `Trop de tentatives. Réessayez dans ${remainingLabel(ipState.lockedUntil, now)}.`
		};
	}

	const folded = foldName(input.username);
	const rows = await getDb().select().from(adminAccount).limit(1);
	const admin = rows[0];
	const nameOk = Boolean(admin && foldName(admin.username) === folded);
	const passwordOk = admin
		? await verifyPassword(admin.passwordHash, input.password)
		: await verifyPassword(dummyPassword!, input.password).then(() => false);

	let codeOk = false;
	let recoveryIndex = -1;
	if (nameOk && passwordOk && admin?.totpConfirmed && admin.totpSecretEnc) {
		const secret = decryptString(admin.totpSecretEnc, config.totpKey);
		if (/^\d{6}$/.test(input.code.replace(/\s/g, ''))) {
			codeOk = verifyTotp(secret, input.code);
		} else if (normalizeRecovery(input.code).length >= 8) {
			recoveryIndex = matchRecoveryCode(admin.recoveryCodes ?? [], input.code, config.pinPepper);
			codeOk = recoveryIndex >= 0;
		}
	}

	if (!nameOk || !passwordOk || !codeOk || !admin) {
		await recordAttempt({ kind: 'admin', ip: input.ip, userId: null, success: false, now });
		const next = ipOnFailure(ipState, now, {
			threshold: 5,
			windowMs: FIFTEEN_MIN,
			durations: ADMIN_IP_LOCK_DURATIONS
		});
		await saveAdminIp(input.ip, next.state);
		await audit({ actor: 'admin', action: 'admin.login.failure', details: { ip: input.ip } });
		if (next.locked && next.state.lockedUntil) {
			return {
				ok: false,
				message: `Trop de tentatives. Réessayez dans ${remainingLabel(next.state.lockedUntil, now)}.`
			};
		}
		return { ok: false, message: ADMIN_INVALID };
	}

	if (recoveryIndex >= 0) {
		const nextCodes = [...(admin.recoveryCodes ?? [])];
		nextCodes.splice(recoveryIndex, 1);
		await getDb()
			.update(adminAccount)
			.set({ recoveryCodes: nextCodes, updatedAt: now })
			.where(eq(adminAccount.id, 1));
		await audit({ actor: 'admin', action: 'admin.recovery.used', details: { remaining: nextCodes.length } });
	}
	await saveAdminIp(input.ip, ipOnSuccess(ipState));
	await recordAttempt({ kind: 'admin', ip: input.ip, userId: null, success: true, now });
	await audit({ actor: 'admin', action: 'admin.login.success' });
	const token = await createSession({
		userId: null,
		isAdmin: true,
		ip: input.ip,
		userAgent: input.userAgent,
		now
	});
	return { ok: true, token, username: admin.username };
}

export async function verifyAdminStepUp(code: string): Promise<boolean> {
	const config = getConfig();
	const rows = await getDb().select().from(adminAccount).limit(1);
	const admin = rows[0];
	if (!admin?.totpSecretEnc || !admin.totpConfirmed) return false;
	const secret = decryptString(admin.totpSecretEnc, config.totpKey);
	if (verifyTotp(secret, code)) return true;
	const index = matchRecoveryCode(admin.recoveryCodes ?? [], code, config.pinPepper);
	if (index < 0) return false;
	const nextCodes = [...(admin.recoveryCodes ?? [])];
	nextCodes.splice(index, 1);
	await getDb()
		.update(adminAccount)
		.set({ recoveryCodes: nextCodes, updatedAt: new Date() })
		.where(eq(adminAccount.id, 1));
	await audit({ actor: 'admin', action: 'admin.recovery.used', details: { remaining: nextCodes.length } });
	return true;
}
