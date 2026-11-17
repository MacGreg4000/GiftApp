/**
 * Sérialiseurs par rôle. L'identité de l'acheteur et le détail des participations
 * ne sortent jamais vers un membre qui n'est pas l'organisateur.
 * Option A : le propriétaire ne reçoit aucun champ de réservation ni de financement.
 */

export type WishRecord = {
	id: string;
	listId: string;
	ownerId: string;
	title: string;
	url: string | null;
	description: string | null;
	priority: number;
	position: number;
	isSurprise: boolean;
	isShared: boolean;
	targetAmountCents: number | null;
	fundedAt: string | null;
	organizerId: string | null;
	purchasedAt: string | null;
};

export type ReservationRecord = {
	buyerId: string;
	buyerName: string;
	status: 'reserve' | 'achete';
	buyerNote: string | null;
	wishUpdatedAfter: boolean;
	createdAt: string;
};

export type ContributionRecord = {
	memberId: string;
	memberName: string;
	amountCents: number | null;
	fractionNum: number | null;
	fractionDen: number | null;
};

export type Viewer = { role: 'admin' } | { role: 'member'; userId: string };

export type Pledge = {
	memberId: string;
	memberName: string;
	amountCents: number | null;
	fractionNum: number | null;
	fractionDen: number | null;
};

export type WishDto = {
	id: string;
	listId: string;
	ownerId: string;
	title: string;
	url: string | null;
	description: string | null;
	priority: number;
	position: number;
	isSurprise: boolean;
	isShared?: boolean;
	targetAmountCents?: number | null;
	taken?: boolean;
	takenByMe?: boolean;
	status?: 'reserve' | 'achete';
	buyerNote?: string | null;
	wishUpdatedAfter?: boolean;
	buyer?: { id: string; name: string };
	reservedAt?: string;
	fundedPercent?: number;
	fundedTotalCents?: number | null;
	participantCount?: number;
	isFunded?: boolean;
	purchased?: boolean;
	organizerName?: string | null;
	myContribution?: Pledge | null;
	pledges?: Pledge[];
};

function fractionValue(item: ContributionRecord): number {
	if (!item.fractionNum || !item.fractionDen) return 0;
	return item.fractionNum / item.fractionDen;
}

export function fundingAggregates(wish: WishRecord, contributions: ContributionRecord[]) {
	let cents = 0;
	let fractions = 0;
	for (const item of contributions) {
		if (item.amountCents) cents += item.amountCents;
		fractions += fractionValue(item);
	}
	let fundedTotalCents: number | null = cents;
	let fundedPercent = 0;
	if (wish.targetAmountCents) {
		const fromFractions = Math.round(fractions * wish.targetAmountCents);
		fundedTotalCents = cents + fromFractions;
		fundedPercent = Math.round((fundedTotalCents / wish.targetAmountCents) * 100);
	} else {
		fundedPercent = Math.round(fractions * 100);
		fundedTotalCents = cents > 0 ? cents : null;
	}
	return {
		fundedTotalCents,
		fundedPercent,
		participantCount: contributions.length,
		isFunded: Boolean(wish.fundedAt) || (wish.targetAmountCents !== null && fundedPercent >= 100)
	};
}

function toPledge(item: ContributionRecord): Pledge {
	return {
		memberId: item.memberId,
		memberName: item.memberName,
		amountCents: item.amountCents,
		fractionNum: item.fractionNum,
		fractionDen: item.fractionDen
	};
}

export function serializeWish(
	wish: WishRecord,
	reservation: ReservationRecord | null,
	contributions: ContributionRecord[],
	viewer: Viewer,
	organizerName: string | null = null
): WishDto {
	const base: WishDto = {
		id: wish.id,
		listId: wish.listId,
		ownerId: wish.ownerId,
		title: wish.title,
		url: wish.url,
		description: wish.description,
		priority: wish.priority,
		position: wish.position,
		isSurprise: wish.isSurprise
	};

	const isOwner = viewer.role === 'member' && viewer.userId === wish.ownerId;
	if (isOwner) {
		return {
			...base,
			isShared: wish.isShared,
			targetAmountCents: wish.isShared ? wish.targetAmountCents : null
		};
	}

	if (!wish.isShared) {
		const taken = reservation !== null;
		const takenByMe = viewer.role === 'member' && reservation?.buyerId === viewer.userId;
		const dto: WishDto = { ...base, taken, takenByMe: Boolean(takenByMe) };
		if (viewer.role === 'admin' && reservation) {
			dto.status = reservation.status;
			dto.buyerNote = reservation.buyerNote;
			dto.wishUpdatedAfter = reservation.wishUpdatedAfter;
			dto.reservedAt = reservation.createdAt;
			dto.buyer = { id: reservation.buyerId, name: reservation.buyerName };
		} else if (takenByMe && reservation) {
			dto.status = reservation.status;
			dto.buyerNote = reservation.buyerNote;
			dto.wishUpdatedAfter = reservation.wishUpdatedAfter;
		}
		return dto;
	}

	const aggregates = fundingAggregates(wish, contributions);
	const mine =
		viewer.role === 'member' ? (contributions.find((item) => item.memberId === viewer.userId) ?? null) : null;
	const isOrganizer = viewer.role === 'member' && wish.organizerId === viewer.userId;
	const dto: WishDto = {
		...base,
		isShared: true,
		targetAmountCents: wish.targetAmountCents,
		fundedPercent: aggregates.fundedPercent,
		fundedTotalCents: aggregates.fundedTotalCents,
		isFunded: aggregates.isFunded,
		purchased: Boolean(wish.purchasedAt),
		myContribution: mine ? toPledge(mine) : null
	};
	if (aggregates.participantCount >= 2) dto.participantCount = aggregates.participantCount;
	if (wish.organizerId) dto.organizerName = organizerName;
	if (viewer.role === 'admin' || isOrganizer) {
		dto.pledges = contributions.map(toPledge);
	}
	return dto;
}

const LEAK_KEYS = ['buyer', 'buyerId', 'buyerName', 'pledges', 'buyerNote'] as const;

/** Vrai si un JSON membre (hors organisateur) contient une identité d'acheteur ou des participations des autres. */
export function memberPayloadLeaks(dto: WishDto, viewerUserId: string): boolean {
	const json = JSON.stringify(dto);
	if (/"buyer"\s*:/.test(json) || /buyerId|buyerName|buyer_id/.test(json)) return true;
	if (dto.pledges) return true;
	if (dto.myContribution && dto.myContribution.memberId !== viewerUserId) return true;
	for (const key of LEAK_KEYS) {
		if (key === 'pledges' || key === 'buyerNote') continue;
		if (key in dto) return true;
	}
	return false;
}
