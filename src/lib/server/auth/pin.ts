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
