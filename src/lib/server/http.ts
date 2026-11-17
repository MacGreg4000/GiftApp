import { clientIpFromForwarded } from './auth/ip';
import { getConfig } from './config';

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'same-origin',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

export function applySecurityHeaders(headers: Headers, https: boolean) {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
	if (https) {
		headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
}

export function requestIp(event: { request: Request; getClientAddress: () => string }): string {
	let socketIp = '0.0.0.0';
	try {
		socketIp = event.getClientAddress();
	} catch {
		socketIp = '0.0.0.0';
	}
	return clientIp(event.request, socketIp);
}

export function clientIp(request: Request, socketIp: string): string {
	const config = getConfig();
	const header = request.headers.get(config.addressHeader);
	return clientIpFromForwarded(header, config.xffDepth, socketIp);
}

export function isHttps(url: URL): boolean {
	return url.protocol === 'https:';
}
