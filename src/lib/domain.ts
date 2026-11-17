/** Nom affiché sur la carte (sans www), jamais l’URL complète. */
export function siteDomain(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const host = new URL(value).hostname.replace(/^www\./i, '');
		return host || null;
	} catch {
		return null;
	}
}
