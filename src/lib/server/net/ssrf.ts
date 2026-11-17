import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

export class FetchBlocked extends Error {
	constructor(message = 'Lien refusé') {
		super(message);
		this.name = 'FetchBlocked';
	}
}

/** Vrai pour les adresses locales, privées, lien-local, multicast et non routables. */
export function isBlockedIp(ip: string): boolean {
	let value = ip.trim().toLowerCase();
	if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
	const zone = value.indexOf('%');
	if (zone !== -1) value = value.slice(0, zone);
	if (value.startsWith('::ffff:')) {
		const mapped = value.slice(7);
		if (isIP(mapped) === 4) return isBlockedIp(mapped);
	}
	if (isIP(value) === 4) {
		const parts = value.split('.').map((part) => Number(part));
		if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
		const [a, b] = parts as [number, number, number, number];
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (a === 192 && b === 0) return true;
		if (a === 198 && (b === 18 || b === 19)) return true;
		if (a >= 224) return true;
		return false;
	}
	if (isIP(value) === 6) {
		if (value === '::1' || value === '::') return true;
		const firstHex = value.split(':').find((piece) => piece.length > 0) ?? '0';
		const first = Number.parseInt(firstHex, 16);
		if (Number.isNaN(first)) return true;
		if (first >= 0xfc00 && first <= 0xfdff) return true;
		if (first >= 0xfe80 && first <= 0xfebf) return true;
		if (first >= 0xff00 && first <= 0xffff) return true;
		if (value.startsWith('2001:db8')) return true;
		return false;
	}
	return true;
}

export function isBlockedHostname(host: string): boolean {
	const name = host.toLowerCase().replace(/\.$/, '');
	if (!name) return true;
	if (name === 'localhost' || name.endsWith('.localhost')) return true;
	if (name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.home.arpa')) return true;
	if (/^\d+$/.test(name)) return true;
	if (isIP(name)) return isBlockedIp(name);
	return false;
}

/** Contrôles sans DNS : schéma, identifiants, port, nom visiblement local. `null` si la suite peut résoudre. */
export function urlBlockReason(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'Lien illisible';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Seuls les liens http et https sont lus';
	if (url.username || url.password) return 'Lien refusé';
	const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
	if (port !== 80 && port !== 443) return 'Port refusé';
	if (isBlockedHostname(url.hostname)) return 'Adresse locale refusée';
	return null;
}

async function assertPublicHost(host: string): Promise<void> {
	if (isBlockedHostname(host)) throw new FetchBlocked('Adresse locale refusée');
	if (isIP(host)) return;
	let records: { address: string }[];
	try {
		records = await lookup(host, { all: true, verbatim: true });
	} catch {
		throw new FetchBlocked('Nom introuvable');
	}
	if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
		throw new FetchBlocked('Adresse privée refusée');
	}
}

function requestOnce(url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
	const lib = url.protocol === 'https:' ? https : http;
	return new Promise((resolve, reject) => {
		const req = lib.request(
			url,
			{
				method: 'GET',
				timeout: TIMEOUT_MS,
				headers: {
					'user-agent': 'NosSouhaits/1.0 (+apercu)',
					accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg;q=0.8,*/*;q=0.5',
					'accept-language': 'fr'
				},
				lookup(hostname, _options, callback) {
					lookup(hostname, { all: true, verbatim: true })
						.then((records) => {
							if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
								const blocked = new Error('Adresse privée refusée') as NodeJS.ErrnoException;
								blocked.code = 'EBLOCKED';
								callback(blocked, '', 4);
								return;
							}
							const first = records[0]!;
							callback(null, first.address, first.family);
						})
						.catch((error: Error) => callback(error, '', 4));
				}
			},
			(res) => {
				const chunks: Buffer[] = [];
				let size = 0;
				res.on('data', (chunk: Buffer) => {
					size += chunk.length;
					if (size > MAX_BYTES) {
						req.destroy();
						reject(new FetchBlocked('Réponse trop volumineuse'));
						return;
					}
					chunks.push(chunk);
				});
				res.on('end', () =>
					resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
				);
				res.on('error', reject);
			}
		);
		req.on('timeout', () => {
			req.destroy();
			reject(new FetchBlocked('Délai dépassé'));
		});
		req.on('error', (error) => {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'EBLOCKED' || error.message.includes('privée')) {
				reject(new FetchBlocked('Adresse privée refusée'));
				return;
			}
			reject(error);
		});
		req.end();
	});
}

export async function safeGet(
	rawUrl: string,
	redirects = 0
): Promise<{ status: number; finalUrl: string; contentType: string; body: Buffer }> {
	if (redirects > MAX_REDIRECTS) throw new FetchBlocked('Trop de redirections');
	const reason = urlBlockReason(rawUrl);
	if (reason) throw new FetchBlocked(reason);
	const url = new URL(rawUrl);
	await assertPublicHost(url.hostname);
	const result = await requestOnce(url);
	if ([301, 302, 303, 307, 308].includes(result.status)) {
		const location = result.headers.location;
		if (!location || Array.isArray(location)) throw new FetchBlocked('Redirection illisible');
		const next = new URL(location, url);
		return safeGet(next.toString(), redirects + 1);
	}
	const header = result.headers['content-type'];
	const contentType = Array.isArray(header) ? (header[0] ?? '') : (header ?? '');
	return { status: result.status, finalUrl: url.toString(), contentType, body: result.body };
}
