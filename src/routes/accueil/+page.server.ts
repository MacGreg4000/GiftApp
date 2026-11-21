import { redirect } from '@sveltejs/kit';
import { festiveGreeting, formatDay } from '#lib/format';
import { groupsForMember } from '#lib/server/groups';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const groups = await groupsForMember(locals.user.id);
	const now = new Date();
	return {
		day: formatDay(now),
		greeting: festiveGreeting(locals.user.displayName, now),
		groups
	};
};
