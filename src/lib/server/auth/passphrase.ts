import { foldName } from './pin';

const COMMON = new Set(
	[
		'password',
		'password1',
		'password123',
		'motdepasse',
		'motdepasse1',
		'azerty',
		'azerty123',
		'qwerty',
		'qwerty123',
		'admin',
		'admin123',
		'administrateur',
		'bonjour',
		'bonsoir',
		'soleil',
		'chocolat',
		'letmein',
		'welcome',
		'iloveyou',
		'princess',
		'monkey',
		'dragon',
		'master',
		'login',
		'abc123',
		'111111',
		'123456',
		'123456789',
		'1234567890',
		'000000',
		'passw0rd',
		'gregory',
		'gregoire',
		'famille',
		'nosouhaits',
		'nossouhaits',
		'cadeau',
		'cadeaux',
		'noel',
		'noel2026',
		'secret',
		'changeme',
		'test',
		'test1234',
		'default',
		'postgres',
		'wishlist',
		'passwordpassword',
		'motdepasse12345'
	].map((item) => item.toLowerCase())
);

export function passphraseProblem(password: string, username: string): string | null {
	if (password.length < 14) {
		return 'La phrase de passe doit contenir au moins 14 caractères.';
	}
	if (password.length > 200) {
		return 'La phrase de passe est trop longue.';
	}
	const compact = foldName(password).replace(/[^a-z0-9]/g, '');
	if (COMMON.has(password.toLowerCase()) || COMMON.has(compact) || COMMON.has(foldName(password))) {
		return 'Cette phrase de passe est trop courante.';
	}
	const foldedUser = foldName(username).replace(/[^a-z0-9]/g, '');
	if (foldedUser.length >= 3 && compact.includes(foldedUser)) {
		return 'La phrase de passe ne doit pas contenir le nom du compte.';
	}
	if (/^(.)\1+$/.test(compact)) {
		return 'Cette phrase de passe est trop simple.';
	}
	return null;
}
