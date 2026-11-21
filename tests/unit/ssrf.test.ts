import { describe, expect, it } from 'vitest';
import { isBlockedIp, urlBlockReason } from '#lib/server/net/ssrf';

describe('adresses refusées pour l’aperçu', () => {
	it('bloque les IP privées, locales et le lien-local', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fd00::1', 'fc00::1', 'fe80::1']) {
			expect(isBlockedIp(ip), ip).toBe(true);
		}
		expect(isBlockedIp('172.32.0.1')).toBe(false);
		expect(isBlockedIp('8.8.8.8')).toBe(false);
		expect(isBlockedIp('1.1.1.1')).toBe(false);
	});

	it('refuse les schémas, ports et noms locaux avant tout DNS', () => {
		expect(urlBlockReason('http://127.0.0.1/secret')).toBeTruthy();
		expect(urlBlockReason('http://169.254.169.254/latest')).toBeTruthy();
		expect(urlBlockReason('http://localhost/admin')).toBeTruthy();
		expect(urlBlockReason('http://imprimante.local/')).toBeTruthy();
		expect(urlBlockReason('file:///etc/passwd')).toBeTruthy();
		expect(urlBlockReason('http://user:pass@exemple.be/')).toBeTruthy();
		expect(urlBlockReason('https://exemple.be:8443/objet')).toBeTruthy();
		expect(urlBlockReason('https://exemple.be/objet')).toBeNull();
	});
});
