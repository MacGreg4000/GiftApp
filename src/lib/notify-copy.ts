export type NotifyPrefs = {
	new_list: boolean;
	new_wish: boolean;
	shared_funded: boolean;
	event_reminder: boolean;
};

export const DEFAULT_PREFS: NotifyPrefs = {
	new_list: true,
	new_wish: false,
	shared_funded: true,
	event_reminder: true
};

export type NoticeKind = 'new_list' | 'new_wish' | 'shared_funded' | 'event_reminder';

export type Notice =
	| { kind: 'new_list'; listId: string; listTitle: string }
	| { kind: 'new_wish'; listId: string; wishId: string; listTitle: string }
	| { kind: 'shared_funded'; listId: string; wishId: string; listTitle: string; wishTitle: string }
	| { kind: 'event_reminder'; listId: string; listTitle: string; days: 1 | 7 };

export type NoticeText = {
	title: string;
	body: string;
	url: string;
	dedupeKind: string;
	refId: string;
};

function clip(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Texte visible. Aucun nom d’acheteur, aucune part, aucun montant ajouté par l’application. */
export function noticeText(notice: Notice): NoticeText {
	if (notice.kind === 'new_list') {
		const title = clip(notice.listTitle) || 'Une liste';
		return {
			title: 'Nouvelle liste',
			body: `« ${title} » est ouverte.`,
			url: `/listes/${notice.listId}`,
			dedupeKind: 'new_list',
			refId: notice.listId
		};
	}
	if (notice.kind === 'new_wish') {
		const title = clip(notice.listTitle) || 'Une liste';
		return {
			title: 'Nouveau souhait',
			body: `Un souhait a été ajouté à « ${title} ».`,
			url: `/listes/${notice.listId}`,
			dedupeKind: 'new_wish',
			refId: notice.wishId
		};
	}
	if (notice.kind === 'shared_funded') {
		const title = clip(notice.wishTitle) || 'Un cadeau commun';
		return {
			title: 'Cadeau commun financé',
			body: `« ${title} » est financé.`,
			url: `/listes/${notice.listId}`,
			dedupeKind: 'shared_funded',
			refId: notice.wishId
		};
	}
	const title = clip(notice.listTitle) || 'Une liste';
	const days = notice.days === 1 ? 'demain' : 'dans 7 jours';
	return {
		title: 'Date qui approche',
		body: `« ${title} » est ${days}.`,
		url: `/listes/${notice.listId}`,
		dedupeKind: notice.days === 1 ? 'event_reminder_1' : 'event_reminder_7',
		refId: notice.listId
	};
}

export function recipients(input: {
	kind: NoticeKind;
	members: { id: string; prefs: NotifyPrefs }[];
	actorId?: string | null;
	ownerId?: string | null;
}): string[] {
	const skip = new Set<string>();
	if ((input.kind === 'new_list' || input.kind === 'new_wish') && input.actorId) skip.add(input.actorId);
	if ((input.kind === 'new_wish' || input.kind === 'shared_funded') && input.ownerId) skip.add(input.ownerId);
	return input.members
		.filter((member) => {
			if (skip.has(member.id)) return false;
			if (input.kind === 'new_list') return member.prefs.new_list;
			if (input.kind === 'new_wish') return member.prefs.new_wish;
			if (input.kind === 'shared_funded') return member.prefs.shared_funded;
			return member.prefs.event_reminder;
		})
		.map((member) => member.id);
}

export function readPrefs(value: unknown): NotifyPrefs {
	const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		new_list: raw.new_list !== false,
		new_wish: raw.new_wish === true,
		shared_funded: raw.shared_funded !== false,
		event_reminder: raw.event_reminder !== false
	};
}
