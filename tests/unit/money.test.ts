import { describe, expect, it } from 'vitest';
import { formatEuros, parseEurosToCents } from '#lib/money';

describe('euros', () => {
	it('lit un montant français', () => {
		expect(parseEurosToCents('')).toBeNull();
		expect(parseEurosToCents('40')).toBe(4000);
		expect(parseEurosToCents('40,50')).toBe(4050);
		expect(parseEurosToCents('40.5')).toBe(4050);
		expect(parseEurosToCents('0')).toBe('bad');
		expect(parseEurosToCents('-3')).toBe('bad');
		expect(parseEurosToCents('12.345')).toBe('bad');
	});

	it('affiche des euros', () => {
		expect(formatEuros(4050)).toContain('40,50');
	});
});
