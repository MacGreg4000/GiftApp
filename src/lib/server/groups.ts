import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { appGroup, appUser, groupMember, wish, wishList } from './db/schema';
import { listProgressForViewer, type WishProgress } from './secrecy/progress';

export async function groupsForMember(userId: string) {
	const memberships = await getDb()
		.select({
			id: appGroup.id,
			name: appGroup.name,
			accent: appGroup.accent,
			archivedAt: appGroup.archivedAt
		})
		.from(groupMember)
		.innerJoin(appGroup, eq(appGroup.id, groupMember.groupId))
		.where(eq(groupMember.userId, userId));

	const active = memberships.filter((group) => !group.archivedAt);
	if (active.length === 0) return [];
	const ids = active.map((group) => group.id);

	const people = await getDb()
		.select({
			groupId: groupMember.groupId,
			id: appUser.id,
			displayName: appUser.displayName,
			label: groupMember.label
		})
		.from(groupMember)
		.innerJoin(appUser, eq(appUser.id, groupMember.userId))
		.where(inArray(groupMember.groupId, ids));

	const lists = await getDb()
		.select({
			id: wishList.id,
			groupId: wishList.groupId,
			title: wishList.title,
			theme: wishList.theme,
			eventDate: wishList.eventDate,
			recipientId: wishList.recipientId
		})
		.from(wishList)
		.where(and(inArray(wishList.groupId, ids), isNull(wishList.archivedAt)));

	const listIds = lists.map((list) => list.id);
	const wishRows: WishProgress[] =
		listIds.length === 0
			? []
			: await getDb()
					.select({
						id: wish.id,
						listId: wish.listId,
						ownerId: wish.ownerId,
						taken: sql<boolean>`exists (select 1 from reservation r where r.wish_id = ${wish.id})`
					})
					.from(wish)
					.where(and(inArray(wish.listId, listIds), isNull(wish.deletedAt)));

	return active.map((group) => {
		const members = people.filter((person) => person.groupId === group.id);
		const groupLists = lists
			.filter((list) => list.groupId === group.id)
			.map((list) => ({
				id: list.id,
				title: list.title,
				theme: list.theme,
				eventDate: list.eventDate,
				recipientName: members.find((person) => person.id === list.recipientId)?.displayName ?? null,
				wishCount: wishRows.filter((item) => item.listId === list.id).length,
				progress: listProgressForViewer(
					wishRows.filter((item) => item.listId === list.id),
					userId
				)
			}));
		return {
			id: group.id,
			name: group.name,
			accent: group.accent,
			memberCount: members.length,
			listCount: groupLists.length,
			members: members.map((person) => ({
				id: person.id,
				displayName: person.displayName,
				label: person.label
			})),
			lists: groupLists
		};
	});
}

export async function groupForMember(userId: string, groupId: string) {
	const groups = await groupsForMember(userId);
	return groups.find((group) => group.id === groupId) ?? null;
}
