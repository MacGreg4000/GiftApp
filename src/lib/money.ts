/** « 40 », « 40,50 » ou « 40.5 » → centimes. Vide → null. Illisible → 'bad'. */
export function parseEurosToCents(value: string): number | null | 'bad' {
	const raw = value.trim().replace(/\s/g, '').replace(',', '.');
	if (!raw) return null;
	if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'bad';
	const [whole, frac = ''] = raw.split('.');
	const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
	if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_00) return 'bad';
	return cents;
}

export function formatEuros(cents: number): string {
	return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
