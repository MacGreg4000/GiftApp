import { error, fail, redirect } from '@sveltejs/kit';
import { getConfig } from '#lib/server/config';
import {
	cancelReservation,
	createWish,
	deleteWish,
	loadListPage,
	markPurchased,
	reserveWish,
	updateList,
	updateWish
} from '#lib/server/lists';
import {
	claimOrganizer,
	completeRest,
	markSharedFunded,
	markSharedPurchased,
	pledge,
	withdrawPledge
} from '#lib/server/funding';
import { urlBlockReason } from '#lib/server/net/ssrf';
import { fetchLinkPreview } from '#lib/server/preview';
import type { Viewer } from '#lib/server/secrecy/dto';
import type { Actions, PageServerLoad } from './$types';

function viewerOf(locals: App.Locals): Viewer | null {
	if (locals.isAdmin) return { role: 'admin' };
	if (locals.user) return { role: 'member', userId: locals.user.id };
	return null;
}

function wishInput(data: FormData) {
	return {
		title: String(data.get('title') ?? ''),
		url: String(data.get('url') ?? ''),
		description: String(data.get('description') ?? ''),
		priority: Number(data.get('priority') ?? 2),
		isSurprise: data.get('surprise') === '1',
		isShared: data.get('commun') === '1',
		target: String(data.get('target') ?? '')
	};
}

function previewInput(data: FormData) {
	const photoId = String(data.get('previewPhotoId') ?? '').trim();
	const title = String(data.get('previewTitle') ?? '').trim();
	const siteName = String(data.get('previewSite') ?? '').trim();
	if (!photoId && !title && !siteName) return null;
	return { photoId: photoId || null, title: title || null, siteName: siteName || null };
}

async function photoInput(data: FormData): Promise<Buffer | null> {
	const file = data.get('photo');
	if (!(file instanceof File) || file.size === 0) return null;
	if (file.size > 10 * 1024 * 1024) throw new Error('La photo dépasse 10 Mo.');
	return Buffer.from(await file.arrayBuffer());
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = viewerOf(locals);
	if (!viewer) redirect(303, '/');
	const page = await loadListPage(params.id, viewer);
	if (!page) error(404, 'Cette liste est introuvable.');
	return {
		page,
		name: locals.user?.displayName ?? locals.adminUsername ?? '',
		admin: locals.isAdmin,
		adminPath: getConfig().adminPath
	};
};

export const actions: Actions = {
	apercu: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const url = String(data.get('url') ?? '').trim();
		if (urlBlockReason(url)) {
			return fail(400, { message: 'Ce lien ne peut pas être lu. Vous pouvez quand même l’enregistrer.' });
		}
		try {
			const preview = await fetchLinkPreview(url, user.id);
			const message =
				preview.title || preview.photoId
					? 'Aperçu ajouté. Le titre reste modifiable.'
					: 'Pas d’aperçu pour ce site. Le lien sera quand même enregistré.';
			return { preview, message };
		} catch {
			return {
				preview: null,
				message: 'Aperçu indisponible pour ce lien. Vous pouvez quand même l’enregistrer.'
			};
		}
	},
	createWish: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		let photo: Buffer | null = null;
		try {
			photo = await photoInput(data);
		} catch (cause) {
			return fail(400, { message: cause instanceof Error ? cause.message : 'Photo refusée.' });
		}
		const result = await createWish({
			userId: user.id,
			listId: event.params.id,
			...wishInput(data),
			photo,
			preview: previewInput(data),
			idempotencyKey: String(data.get('idempotencyKey') ?? '')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	updateWish: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		let photo: Buffer | null = null;
		try {
			photo = await photoInput(data);
		} catch (cause) {
			return fail(400, { message: cause instanceof Error ? cause.message : 'Photo refusée.' });
		}
		const result = await updateWish({
			userId: user.id,
			wishId: String(data.get('wishId') ?? ''),
			...wishInput(data),
			photo,
			removePhoto: data.get('retirerPhoto') === '1',
			preview: previewInput(data)
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	deleteWish: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await deleteWish(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	reserve: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await reserveWish(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	cancel: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await cancelReservation(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	bought: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await markPurchased(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	participer: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await pledge({
			userId: user.id,
			wishId: String(data.get('wishId') ?? ''),
			mode: String(data.get('mode') ?? 'montant'),
			euros: String(data.get('euros') ?? ''),
			fraction: String(data.get('part') ?? '')
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	retirerPart: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await withdrawPledge(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	occuper: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await claimOrganizer(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	completer: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await completeRest(user.id, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	finance: async (event) => {
		const viewer = viewerOf(event.locals);
		if (!viewer) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await markSharedFunded(viewer, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	acheteCommun: async (event) => {
		const viewer = viewerOf(event.locals);
		if (!viewer) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await markSharedPurchased(viewer, String(data.get('wishId') ?? ''));
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	},
	updateList: async (event) => {
		if (!event.locals.isAdmin) return fail(403, { message: 'Seul l’administrateur modifie une liste.' });
		const data = await event.request.formData();
		const result = await updateList({
			actor: { role: 'admin' },
			listId: event.params.id,
			title: String(data.get('title') ?? ''),
			theme: String(data.get('theme') ?? ''),
			eventDate: String(data.get('eventDate') ?? ''),
			recipientId: String(data.get('recipientId') ?? ''),
			archived: data.get('archived') === '1'
		});
		if (!result.ok) return fail(400, { message: result.message });
		redirect(303, `/listes/${event.params.id}`);
	}
};
