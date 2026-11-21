import { getConfig } from '#lib/server/config';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		isAdmin: locals.isAdmin,
		adminUsername: locals.adminUsername,
		adminPath: getConfig().adminPath
	};
};
