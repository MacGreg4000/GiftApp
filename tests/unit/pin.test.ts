import { describe, expect, it } from 'vitest';
import { foldName, generatePin, isTrivialPin, suggestLoginName } from '#lib/server/auth/pin';
import { passphraseProblem } from '#lib/server/auth/passphrase';
import { clientIpFromForwarded } from '#lib/server/auth/ip';

describe('codes PIN', () => {
	it('rejette les suites, répétitions, dates et années', () => {
		for (const pin of ['000000', '123456', '654321', '121212', '111111', '202611', '251225', '140317']) {
			expect(isTrivialPin(pin)).toBe(true);
		}
		expect(isTrivialPin('847291')).toBe(false);
	});

	it('ne génère pas de code trivial', () => {
		for (let i = 0; i < 30; i++) expect(isTrivialPin(generatePin())).toBe(false);
	});

	it('plie les prénoms et distingue les homonymes', () => {
		expect(foldName(' Émile ')).toBe('emile');
		const taken = new Set(['marie']);
		expect(suggestLoginName('Marie Dupont', taken)).toBe('marie.d');
		expect(suggestLoginName('Lucie', new Set())).toBe('lucie');
	});
});

describe('phrase de passe admin', () => {
	it('refuse les phrases courtes, courantes ou contenant le nom', () => {
		expect(passphraseProblem('court', 'Grégory')).toMatch(/14/);
		expect(passphraseProblem('motdepasse12345', 'Grégory')).toMatch(/courante/);
		expect(passphraseProblem('gregory-adore-noel', 'Grégory')).toMatch(/nom/);
		expect(passphraseProblem('les sapins de la forêt', 'Grégory')).toBeNull();
	});
});

describe('adresse client derrière le proxy', () => {
	it('ne croit que le dernier saut quand XFF_DEPTH vaut 1', () => {
		expect(clientIpFromForwarded('1.2.3.4, 203.0.113.9', 1, '10.0.0.2')).toBe('203.0.113.9');
		expect(clientIpFromForwarded('203.0.113.9', 1, '10.0.0.2')).toBe('203.0.113.9');
		expect(clientIpFromForwarded(null, 1, '10.0.0.2')).toBe('10.0.0.2');
		expect(clientIpFromForwarded('9.9.9.9, 203.0.113.9, 10.0.0.8', 2, '10.0.0.2')).toBe('203.0.113.9');
	});
});
