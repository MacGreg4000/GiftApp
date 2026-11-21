const TRIVIAL = new Set([
	'000000',
	'111111',
	'222222',
	'333333',
	'444444',
	'555555',
	'666666',
	'777777',
	'888888',
	'999999',
	'123456',
	'654321',
	'123123',
	'112233',
	'121212',
	'102030',
	'010203',
	'012345',
	'987654',
	'123321',
	'111222',
	'000001',
	'123450',
	'001122',
	'135790',
	'246810'
]);

function isRealDate(day: number, month: number, year: number): boolean {
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const fullYear = year >= 100 ? year : year >= 70 ? 1900 + year : 2000 + year;
	const date = new Date(Date.UTC(fullYear, month - 1, day));
	return date.getUTCFullYear() === fullYear && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function looksLikeDate(pin: string): boolean {
	const dd = Number(pin.slice(0, 2));
	const mm = Number(pin.slice(2, 4));
	const yy = Number(pin.slice(4, 6));
	if (isRealDate(dd, mm, yy)) return true;
	const mm2 = Number(pin.slice(0, 2));
	const dd2 = Number(pin.slice(2, 4));
	if (isRealDate(dd2, mm2, yy)) return true;
	const yy3 = Number(pin.slice(0, 2));
	const mm3 = Number(pin.slice(2, 4));
	const dd3 = Number(pin.slice(4, 6));
	if (isRealDate(dd3, mm3, yy3)) return true;
	return false;
}

/** PIN prévisibles : utilisé seulement pour ne pas en proposer au bouton Générer. */
export function isTrivialPin(pin: string): boolean {
	if (!/^\d{6}$/.test(pin)) return true;
	if (TRIVIAL.has(pin)) return true;
	if (/^(\d)\1{5}$/.test(pin)) return true;
	const digits = [...pin].map(Number);
	let ascending = true;
	let descending = true;
	for (let i = 1; i < digits.length; i++) {
		if (digits[i] !== digits[i - 1]! + 1) ascending = false;
		if (digits[i] !== digits[i - 1]! - 1) descending = false;
	}
	if (ascending || descending) return true;
	if (pin.slice(0, 3) === pin.slice(3)) return true;
	if (pin.slice(0, 2) === pin.slice(2, 4) && pin.slice(2, 4) === pin.slice(4) && pin[0] === pin[1]) {
		return true;
	}
	if (/19\d{2}|20\d{2}/.test(pin)) return true;
	if (looksLikeDate(pin)) return true;
	return false;
}

/** Vide = à générer. Seule la longueur est contrôlée : l'admin choisit librement le code (dates, suites… acceptées). Le login reste prénom + code : deux personnes peuvent avoir le même code. */
export function pinProblem(raw: string): string | null {
	const digits = raw.replace(/\D/g, '');
	if (!digits) return null;
	if (digits.length !== 6) return 'Le code doit contenir exactement 6 chiffres.';
	return null;
}

/** Code proposé à l’écran. Le serveur revérifie avant de l’enregistrer. */
export function suggestPin(): string {
	const buf = new Uint32Array(1);
	for (let i = 0; i < 200; i++) {
		crypto.getRandomValues(buf);
		const pin = (buf[0]! % 1_000_000).toString().padStart(6, '0');
		if (!isTrivialPin(pin)) return pin;
	}
	return '847291';
}
