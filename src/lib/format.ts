const BRUSSELS = 'Europe/Brussels';

export function formatDay(now = new Date()): string {
	return new Intl.DateTimeFormat('fr-BE', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: BRUSSELS
	}).format(now);
}

export function formatWhen(date: Date | null, now = new Date()): string {
	if (!date) return 'Jamais connecté';
	const day = new Intl.DateTimeFormat('fr-BE', {
		day: 'numeric',
		month: 'short',
		timeZone: BRUSSELS
	}).format(date);
	const time = new Intl.DateTimeFormat('fr-BE', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: BRUSSELS
	}).format(date);
	const today = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeZone: BRUSSELS }).format(now);
	const that = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeZone: BRUSSELS }).format(date);
	const yesterday = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeZone: BRUSSELS }).format(
		new Date(now.getTime() - 24 * 60 * 60 * 1000)
	);
	if (that === today) return `Aujourd’hui, ${time}`;
	if (that === yesterday) return `Hier, ${time}`;
	return `${day}, ${time}`;
}

export function formatEventDate(iso: string | null): string {
	if (!iso) return 'Sans date';
	const [year, month, day] = iso.split('-').map(Number);
	if (!year || !month || !day) return iso;
	const date = new Date(Date.UTC(year, month - 1, day));
	return new Intl.DateTimeFormat('fr-BE', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(date);
}

/** Écart en jours civils, fuseau de Bruxelles. Négatif si la date est passée. */
export function eventOffsetDays(iso: string | null, now = new Date()): number | null {
	if (!iso) return null;
	const [year, month, day] = iso.split('-').map(Number);
	if (!year || !month || !day) return null;
	const target = Date.UTC(year, month - 1, day);
	const todayParts = new Intl.DateTimeFormat('en-CA', {
		timeZone: BRUSSELS,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
	const [ty, tm, td] = todayParts.split('-').map(Number);
	const today = Date.UTC(ty!, tm! - 1, td!);
	return Math.round((target - today) / 86400000);
}

export function daysUntil(iso: string | null, now = new Date()): string | null {
	const diff = eventOffsetDays(iso, now);
	if (diff === null) return null;
	if (diff > 1) return `dans ${diff} jours`;
	if (diff === 1) return 'demain';
	if (diff === 0) return 'aujourd’hui';
	if (diff === -1) return 'hier';
	return `il y a ${-diff} jours`;
}

export function festiveGreeting(name: string, now = new Date()): { lead: string; accent: string; tail: string } {
	const month = Number(
		new Intl.DateTimeFormat('en-CA', { timeZone: BRUSSELS, month: 'numeric' }).format(now)
	);
	if (month === 11 || month === 12) {
		return { lead: 'Bonjour ', accent: name, tail: ', les fêtes approchent !' };
	}
	return { lead: 'Bonjour ', accent: name, tail: ' !' };
}

export function lockLabel(lockLevel: number, lockedUntil: Date | null, now = new Date()): string | null {
	if (lockLevel >= 4) return 'Bloqué';
	if (!lockedUntil || lockedUntil.getTime() <= now.getTime()) return null;
	const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
	if (minutes < 90) return `Bloqué ${minutes} min`;
	const hours = Math.ceil(minutes / 60);
	return `Bloqué ${hours} h`;
}
