import { Secret, TOTP } from 'otpauth';

export function createTotpSecret(): string {
	return new Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, username: string): string {
	return new TOTP({
		issuer: 'Nos Souhaits',
		label: username,
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secret)
	}).toString();
}

export function verifyTotp(secret: string, token: string): boolean {
	const totp = new TOTP({
		issuer: 'Nos Souhaits',
		label: 'admin',
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secret)
	});
	const clean = token.replace(/\s/g, '');
	if (!/^\d{6}$/.test(clean)) return false;
	return totp.validate({ token: clean, window: 1 }) !== null;
}
