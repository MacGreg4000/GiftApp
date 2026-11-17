export type ReservationCard = 'rien' | 'libre' | 'mien' | 'pris' | 'achete';

/** `taken` absent (propriétaire, option A) → rien à afficher. */
export function reservationCard(wish: {
	taken?: boolean;
	takenByMe?: boolean;
	status?: 'reserve' | 'achete';
	isShared?: boolean;
}): ReservationCard {
	if (wish.isShared || wish.taken === undefined) return 'rien';
	if (wish.takenByMe && wish.status === 'achete') return 'achete';
	if (wish.takenByMe) return 'mien';
	if (wish.taken) return 'pris';
	return 'libre';
}

/** Texte affiché sur la carte. `rien` ne produit rien : le propriétaire ne voit pas l’état. */
export function reservationText(card: ReservationCard): string | null {
	if (card === 'pris') return 'Déjà pris';
	if (card === 'mien') return 'Vous l’avez réservé';
	if (card === 'achete') return 'Vous l’avez acheté';
	return null;
}
