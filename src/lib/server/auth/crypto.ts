import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const ARGON_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
	algorithm: 2 as const
};

export function pinMaterial(pin: string, pepper: string): string {
	return createHmac('sha256', pepper).update(pin).digest('hex');
}

export async function hashPin(pin: string, pepper: string): Promise<string> {
	return hash(pinMaterial(pin, pepper), ARGON_OPTIONS);
}

export async function verifyPin(storedHash: string, pin: string, pepper: string): Promise<boolean> {
	return verify(storedHash, pinMaterial(pin, pepper), ARGON_OPTIONS);
}

export async function verifyPinOrDummy(
	storedHash: string | null,
	pin: string,
	pepper: string,
	dummyHash: string
): Promise<boolean> {
	if (!storedHash) {
		await verify(dummyHash, pinMaterial(pin, pepper), ARGON_OPTIONS);
		return false;
	}
	return verify(storedHash, pinMaterial(pin, pepper), ARGON_OPTIONS);
}

export async function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
	return verify(storedHash, password, ARGON_OPTIONS);
}

export async function dummyHash(): Promise<string> {
	return hash(randomBytes(32).toString('hex'), ARGON_OPTIONS);
}

export function sha256(value: string | Uint8Array): Buffer {
	return createHash('sha256').update(value).digest();
}

export function newSessionToken(): { token: string; tokenHash: Buffer } {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: sha256(token) };
}

/** Clé AES du code membre : PIN_KEY si elle est définie, sinon dérivée de TOTP_KEY. */
export function pinEncryptionKey(totpKey: string): string {
	const explicit = process.env.PIN_KEY?.trim().toLowerCase() ?? '';
	if (explicit) {
		if (!/^[0-9a-f]{64}$/.test(explicit)) {
			throw new Error('PIN_KEY doit faire 64 caractères hexadécimaux.');
		}
		return explicit;
	}
	return createHash('sha256').update(`nos-souhaits-pin-v1:${totpKey}`).digest('hex');
}

export function encryptString(plain: string, keyHex: string): Buffer {
	const key = Buffer.from(keyHex, 'hex');
	if (key.length !== 32) throw new Error('Clé de chiffrement invalide');
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, enc]);
}

export function decryptString(payload: Buffer, keyHex: string): string {
	const key = Buffer.from(keyHex, 'hex');
	const iv = payload.subarray(0, 12);
	const tag = payload.subarray(12, 28);
	const data = payload.subarray(28);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hashRecoveryCode(code: string, pepper: string): string {
	return createHmac('sha256', pepper).update(normalizeRecovery(code)).digest('hex');
}

export function normalizeRecovery(code: string): string {
	return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function matchRecoveryCode(hashes: string[], code: string, pepper: string): number {
	const digest = Buffer.from(hashRecoveryCode(code, pepper), 'hex');
	let found = -1;
	for (let i = 0; i < hashes.length; i++) {
		const candidate = Buffer.from(hashes[i], 'hex');
		if (candidate.length === digest.length && timingSafeEqual(candidate, digest)) found = i;
	}
	return found;
}

export function safeEqualText(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) {
		timingSafeEqual(left, left);
		return false;
	}
	return timingSafeEqual(left, right);
}

export function recoveryCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = randomBytes(8);
	let raw = '';
	for (let i = 0; i < 8; i++) raw += alphabet[bytes[i]! % alphabet.length];
	return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
