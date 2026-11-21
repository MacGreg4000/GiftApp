import { describe, expect, it } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { decryptString, encryptString, hashRecoveryCode, matchRecoveryCode, recoveryCode } from '#lib/server/auth/crypto';
import { createTotpSecret, verifyTotp } from '#lib/server/auth/totp';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('TOTP et codes de secours', () => {
	it('chiffre le secret et accepte le code courant', () => {
		const secret = createTotpSecret();
		const round = decryptString(encryptString(secret, KEY), KEY);
		expect(round).toBe(secret);
		const token = new TOTP({
			secret: Secret.fromBase32(secret),
			digits: 6,
			period: 30,
			algorithm: 'SHA1'
		}).generate();
		expect(verifyTotp(secret, token)).toBe(true);
		expect(verifyTotp(secret, '000000')).toBe(false);
	});

	it('reconnaît un code de secours une seule fois', () => {
		const code = recoveryCode();
		const hashes = [hashRecoveryCode(code, 'pepper-de-test-assez-long')];
		expect(matchRecoveryCode(hashes, code.toLowerCase(), 'pepper-de-test-assez-long')).toBe(0);
		expect(matchRecoveryCode(hashes, 'ZZZZ-ZZZZ', 'pepper-de-test-assez-long')).toBe(-1);
	});
});
