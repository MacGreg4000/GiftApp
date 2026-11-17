export const ACCENT_COLORS: Record<string, { header: string; ink: string; label: string }> = {
	brique: { header: '#9d2f2c', ink: '#fff7ef', label: 'Brique' },
	sapin: { header: '#2c5a43', ink: '#f4fbf6', label: 'Sapin' },
	or: { header: '#b7842b', ink: '#fff8ea', label: 'Or' },
	corail: { header: '#d4654c', ink: '#fff6f2', label: 'Corail' },
	sarcelle: { header: '#1f7f78', ink: '#f3fbfa', label: 'Sarcelle' },
	soleil: { header: '#d29a22', ink: '#fff8e8', label: 'Soleil' }
};

const AVATARS = ['#b8322a', '#2c5a43', '#c4922e', '#2a9488', '#7a4e8a', '#d4654c', '#3d6f8f', '#8a5a3b', '#5c6b3d'];

export function avatarColor(seed: string): string {
	let hash = 0;
	for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
	return AVATARS[hash % AVATARS.length]!;
}

export function initial(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return '?';
	return trimmed.charAt(0).toLocaleUpperCase('fr-BE');
}

export const THEME_LABELS: Record<string, string> = {
	noel: 'Noël',
	saint_nicolas: 'Saint-Nicolas',
	anniversaire: 'Anniversaire',
	paques: 'Pâques',
	fete_des_meres: 'Fête des mères',
	fete_des_peres: 'Fête des pères',
	mariage: 'Mariage',
	naissance: 'Naissance',
	generique: 'Liste'
};
