/** Répartit des chiffres collés ou saisis vite, une case à la fois. */
export function placeDigits(current: string[], raw: string, start: number): { digits: string[]; focus: number } {
	const chars = raw.replace(/\D/g, '').slice(0, Math.max(0, 6 - start)).split('');
	const next = current.slice(0, 6);
	while (next.length < 6) next.push('');
	if (chars.length === 0) {
		next[start] = '';
		return { digits: next, focus: start };
	}
	chars.forEach((char, offset) => {
		next[start + offset] = char;
	});
	const focus = Math.min(start + chars.length, 5);
	return { digits: next, focus };
}
