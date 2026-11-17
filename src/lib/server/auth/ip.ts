/** Dernier saut de confiance : avec XFF_DEPTH=1, on prend l’adresse ajoutée par le proxy. */
export function clientIpFromForwarded(headerValue: string | null, depth: number, socketIp: string): string {
	if (!headerValue) return socketIp;
	const parts = headerValue
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) return socketIp;
	const index = parts.length - Math.max(1, depth);
	return parts[index] ?? parts[0] ?? socketIp;
}
