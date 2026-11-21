export type WishProgress = {
	id: string;
	listId: string;
	ownerId: string;
	taken: boolean;
};

export type ListProgress = {
	taken: number;
	total: number;
} | null;

/**
 * La barre « déjà pris » ne compte pas les souhaits du visiteur :
 * il ne doit pas déduire l'état des siens à partir du total.
 */
export function listProgressForViewer(wishes: WishProgress[], viewerId: string): ListProgress {
	const visible = wishes.filter((wish) => wish.ownerId !== viewerId);
	if (visible.length === 0) return null;
	return {
		total: visible.length,
		taken: visible.filter((wish) => wish.taken).length
	};
}
