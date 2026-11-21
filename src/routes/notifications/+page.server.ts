import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { readPrefs } from '#lib/notify-copy';
import { pushConfigured, pushPublicKey } from '#lib/server/config';
import { getDb } from '#lib/server/db/client';
import { appUser } from '#lib/server/db/schema';
import { removeSubscription, savePrefs, saveSubscription } from '#lib/server/push';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const rows = await getDb()
		.select({ prefs: appUser.notifyPrefs })
		.from(appUser)
		.where(eq(appUser.id, locals.user.id))
		.limit(1);
	return {
		name: locals.user.displayName,
		configured: pushConfigured(),
		publicKey: pushPublicKey(),
		prefs: readPrefs(rows[0]?.prefs)
	};
};

function flag(data: FormData, name: string): boolean {
	return data.get(name) === '1';
}

export const actions: Actions = {
	prefs: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		await savePrefs(user.id, {
			newList: flag(data, 'newList'),
			newWish: flag(data, 'newWish'),
			sharedFunded: flag(data, 'sharedFunded'),
			eventReminder: flag(data, 'eventReminder')
		});
		return { message: 'Préférences enregistrées.' };
	},
	subscribe: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		const result = await saveSubscription(user.id, {
			endpoint: String(data.get('endpoint') ?? ''),
			p256dh: String(data.get('p256dh') ?? ''),
			auth: String(data.get('auth') ?? ''),
			label: event.request.headers.get('user-agent')
		});
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Notifications activées sur cet appareil.' };
	},
	unsubscribe: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Connexion requise.' });
		const data = await event.request.formData();
		await removeSubscription(user.id, String(data.get('endpoint') ?? ''));
		return { message: 'Notifications coupées sur cet appareil.' };
	}
};
