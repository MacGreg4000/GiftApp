import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { getConfig } from './config';
import { getDb } from './db/client';
import { adminAccount } from './db/schema';
import { audit } from './auth/audit';
import { decryptString, encryptString, hashPassword, hashRecoveryCode, recoveryCode, safeEqualText } from './auth/crypto';
import { foldName } from './auth/pin';
import { passphraseProblem } from './auth/passphrase';
import { createSession } from './auth/session';
import { createTotpSecret, totpUri, verifyTotp } from './auth/totp';

let readyCache = false;

export function resetSetupCache() {
	readyCache = false;
}

export async function isSetupComplete(): Promise<boolean> {
	if (readyCache) return true;
	const rows = await getDb()
		.select({ ok: adminAccount.totpConfirmed })
		.from(adminAccount)
		.limit(1);
	readyCache = rows[0]?.ok === true;
	return readyCache;
}

export function markSetupComplete() {
	readyCache = true;
}

export async function ensureSetupToken(): Promise<string> {
	if (process.env.SETUP_TOKEN?.trim()) return process.env.SETUP_TOKEN.trim();
	const file = getConfig().setupTokenFile;
	if (existsSync(file)) {
		const existing = readFileSync(file, 'utf8').trim();
		if (existing) return existing;
	}
	const token = randomBytes(9).toString('base64url');
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, token + '\n', { mode: 0o600 });
	try {
		chmodSync(file, 0o600);
	} catch {
		/* volume éventuellement en lecture seule */
	}
	console.log(`\n  Code d'installation Nos Souhaits : ${token}`);
	console.log(`  Il est aussi écrit dans ${file} jusqu'à la fin de l'installation.\n`);
	return token;
}

export function clearSetupToken() {
	if (process.env.SETUP_TOKEN?.trim()) return;
	const file = getConfig().setupTokenFile;
	try {
		if (existsSync(file)) rmSync(file);
	} catch {
		try {
			writeFileSync(file, '', { mode: 0o600 });
		} catch (error) {
			console.error('Impossible d’effacer le code d’installation', error);
		}
	}
}

export async function setupPhase(): Promise<'account' | 'totp' | 'ready'> {
	if (await isSetupComplete()) return 'ready';
	const rows = await getDb().select().from(adminAccount).limit(1);
	if (!rows[0]) return 'account';
	return 'totp';
}

export async function beginSetup(input: { username: string; password: string; setupCode: string }) {
	if (await isSetupComplete()) return { ok: false as const, message: 'L’installation est déjà terminée.' };
	const expected = await ensureSetupToken();
	if (!safeEqualText(input.setupCode.trim(), expected)) {
		return { ok: false as const, message: 'Code d’installation incorrect. Il est affiché dans les journaux du conteneur.' };
	}
	const username = input.username.trim();
	if (username.length < 2 || username.length > 40) {
		return { ok: false as const, message: 'Le nom du compte doit contenir entre 2 et 40 caractères.' };
	}
	const problem = passphraseProblem(input.password, username);
	if (problem) return { ok: false as const, message: problem };
	const secret = createTotpSecret();
	const config = getConfig();
	const passwordHash = await hashPassword(input.password);
	const secretEnc = encryptString(secret, config.totpKey);
	const existing = await getDb().select({ id: adminAccount.id }).from(adminAccount).limit(1);
	if (existing[0]) {
		await getDb()
			.update(adminAccount)
			.set({
				username,
				passwordHash,
				totpSecretEnc: secretEnc,
				totpConfirmed: false,
				recoveryCodes: [],
				updatedAt: new Date()
			})
			.where(eq(adminAccount.id, 1));
	} else {
		await getDb().insert(adminAccount).values({
			id: 1,
			username,
			passwordHash,
			totpSecretEnc: secretEnc,
			totpConfirmed: false,
			recoveryCodes: []
		});
	}
	return { ok: true as const };
}

export async function totpSetupView() {
	const rows = await getDb().select().from(adminAccount).limit(1);
	const admin = rows[0];
	if (!admin?.totpSecretEnc) return null;
	const secret = decryptString(admin.totpSecretEnc, getConfig().totpKey);
	const uri = totpUri(secret, admin.username);
	const qr = await QRCode.toString(uri, {
		type: 'svg',
		margin: 1,
		color: { dark: '#3a2a22', light: '#fffaf2' }
	});
	return { username: admin.username, secret, qr };
}

export async function confirmTotp(code: string): Promise<{ ok: true; codes: string[] } | { ok: false; message: string }> {
	const rows = await getDb().select().from(adminAccount).limit(1);
	const admin = rows[0];
	if (!admin?.totpSecretEnc) return { ok: false, message: 'Reprenez l’installation depuis le début.' };
	const secret = decryptString(admin.totpSecretEnc, getConfig().totpKey);
	if (!verifyTotp(secret, code)) {
		return { ok: false, message: 'Code d’authentification incorrect. Vérifiez l’heure de l’appareil.' };
	}
	const pepper = getConfig().pinPepper;
	const codes = Array.from({ length: 10 }, () => recoveryCode());
	const hashes = codes.map((item) => hashRecoveryCode(item, pepper));
	await getDb()
		.update(adminAccount)
		.set({ recoveryCodes: hashes, updatedAt: new Date() })
		.where(eq(adminAccount.id, 1));
	return { ok: true, codes };
}

export async function finishSetup(input: { ip: string; userAgent: string | null }) {
	const rows = await getDb().select().from(adminAccount).limit(1);
	const admin = rows[0];
	if (!admin?.totpSecretEnc || (admin.recoveryCodes ?? []).length < 10) {
		return { ok: false as const, message: 'Confirmez d’abord le code d’authentification.' };
	}
	await getDb()
		.update(adminAccount)
		.set({ totpConfirmed: true, updatedAt: new Date() })
		.where(eq(adminAccount.id, 1));
	markSetupComplete();
	clearSetupToken();
	await audit({ actor: 'admin', action: 'admin.setup', details: { username: foldName(admin.username) } });
	const token = await createSession({
		userId: null,
		isAdmin: true,
		ip: input.ip,
		userAgent: input.userAgent
	});
	return { ok: true as const, token, username: admin.username };
}
