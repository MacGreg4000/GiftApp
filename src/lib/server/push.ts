/** Renseigné par l’étape notifications. Les cagnottes appellent déjà ce point. */
export async function noteSharedFunded(_input: {
	groupId: string;
	listId: string;
	listTitle: string;
	wishId: string;
	wishTitle: string;
	ownerId: string;
}): Promise<void> {}
