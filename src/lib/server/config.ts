export const DEV_PEPPER = 'dev-pepper-change-me-not-for-production-use!!';
export const DEV_TOTP_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export const DEV_DB_PASSWORD = 'wishlist-dev-password';

export type AppConfig = {
	databaseUrl: string;
	pinPepper: string;
	totpKey: string;
	adminPath: string;
	origin: string;
	uploadDir: string;
	backupDir: string;
	setupTokenFile: string;
	xffDepth: number;
	addressHeader: string;
	usingDevSecrets: boolean;
};

function normalizeAdminPath(value: string | undefined): string {
	const raw = (value ?? '/gestion').trim();
	if (!raw.startsWith('/')) return '/gestion';
	const cleaned = raw.replace(/\/+$/, '');
	if (!/^\/[A-Za-z0-9][A-Za-z0-9/_-]{0,80}$/.test(cleaned)) return '/gestion';
	if (cleaned === '/' || cleaned.startsWith('/_') || cleaned === '/installation') return '/gestion';
	return cleaned;
}

export function getConfig(): AppConfig {
	const databaseUrl =
		process.env.DATABASE_URL ??
		`postgres://wishlist:${DEV_DB_PASSWORD}@127.0.0.1:5432/wishlist`;
	const pinPepper = process.env.PIN_PEPPER ?? DEV_PEPPER;
	const totpKey = (process.env.TOTP_KEY ?? DEV_TOTP_KEY).toLowerCase();
	const uploadDir = process.env.UPLOAD_DIR ?? './data/uploads';
	const backupDir = process.env.BACKUP_DIR ?? './data/backups';
	const usingDevSecrets =
		pinPepper === DEV_PEPPER || totpKey === DEV_TOTP_KEY || databaseUrl.includes(DEV_DB_PASSWORD);
	return {
		databaseUrl,
		pinPepper,
		totpKey,
		adminPath: normalizeAdminPath(process.env.ADMIN_PATH),
		origin: process.env.ORIGIN ?? 'http://127.0.0.1:3080',
		uploadDir,
		backupDir,
		setupTokenFile: process.env.SETUP_TOKEN_FILE ?? './data/uploads/setup-token',
		xffDepth: Math.max(1, Number(process.env.XFF_DEPTH ?? '1') || 1),
		addressHeader: (process.env.ADDRESS_HEADER ?? 'x-forwarded-for').toLowerCase(),
		usingDevSecrets
	};
}

export function assertProductionSecrets(config = getConfig()): void {
	if (config.pinPepper.length < 32) {
		throw new Error('PIN_PEPPER trop court : 32 caractères minimum.');
	}
	if (!/^[0-9a-f]{64}$/.test(config.totpKey)) {
		throw new Error('TOTP_KEY doit contenir 64 caractères hexadécimaux (32 octets).');
	}
	if (config.origin.startsWith('https://') && config.usingDevSecrets) {
		throw new Error(
			'Refus de démarrer : ORIGIN est en HTTPS avec des secrets de développement. Définissez PIN_PEPPER, TOTP_KEY et DB_PASSWORD.'
		);
	}
}
