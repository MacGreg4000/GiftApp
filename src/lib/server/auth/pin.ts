import { isTrivialPin, pinProblem, suggestPin } from '../../pin-code';

export { isTrivialPin, pinProblem, suggestPin };

export function generatePin(): string {
	return suggestPin();
}

export function foldName(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');
}

export function suggestLoginName(displayName: string, taken: Set<string>): string {
	const parts = displayName
		.trim()
		.split(/\s+/)
		.map((part) => foldName(part).replace(/[^a-z0-9]/g, ''))
		.filter(Boolean);
	const base = (parts[0] || 'membre').slice(0, 24);
	if (!taken.has(base)) return base;
	if (parts[1]) {
		const withInitial = `${base}.${parts[1][0]}`;
		if (!taken.has(withInitial)) return withInitial;
	}
	for (let i = 2; i < 200; i++) {
		const candidate = `${base}${i}`;
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error('Prénom de connexion indisponible');
}

export function normalizePin(value: string): string {
	return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * Formes possibles du prénom tapé à la connexion.
 * Le prénom affiché « Jean-Luc » est enregistré « jeanluc » : les deux doivent se retrouver.
 */
export function loginCandidates(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [];
	const keys: string[] = [];
	const variants = [trimmed, trimmed.split(/\s+/)[0] ?? ''];
	for (const variant of variants) {
		const folded = foldName(variant).replace(/\s+/g, '');
		const compact = folded.replace(/[^a-z0-9]/g, '');
		for (const key of [folded, compact]) {
			if (key && !keys.includes(key)) keys.push(key);
		}
	}
	return keys;
}
