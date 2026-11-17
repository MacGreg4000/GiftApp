import { describe, expect, it } from 'vitest';
import { placeDigits } from '#lib/pin-digits';

const empty = ['', '', '', '', '', ''];

describe('répartition du code', () => {
	it('étale un code collé dès la première case', () => {
		const placed = placeDigits(empty, '056069', 0);
		expect(placed.digits).toEqual(['0', '5', '6', '0', '6', '9']);
		expect(placed.focus).toBe(5);
	});

	it('n’empile pas les chiffres suivants sur une case déjà remplie', () => {
		const first = placeDigits(empty, '0', 0);
		const second = placeDigits(first.digits, '5', 1);
		expect(second.digits).toEqual(['0', '5', '', '', '', '']);
		expect(second.focus).toBe(2);
	});

	it('ignore les lettres et ne dépasse pas six cases', () => {
		const placed = placeDigits(['1', '2', '', '', '', ''], 'ab3456789', 2);
		expect(placed.digits).toEqual(['1', '2', '3', '4', '5', '6']);
		expect(placed.focus).toBe(5);
	});
});
