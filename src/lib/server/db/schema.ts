import {
	bigserial,
	boolean,
	check,
	customType,
	date,
	index,
	inet,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	},
	toDriver(value) {
		return value;
	},
	fromDriver(value) {
		const raw: unknown = value;
		if (Buffer.isBuffer(raw)) return raw;
		if (raw instanceof Uint8Array) return Buffer.from(raw);
		if (typeof raw === 'string') {
			const hex = raw.startsWith('\\x') ? raw.slice(2) : raw;
			return Buffer.from(hex, 'hex');
		}
		throw new Error('Valeur bytea illisible');
	}
});

export const listTheme = pgEnum('list_theme', [
	'noel',
	'saint_nicolas',
	'anniversaire',
	'paques',
	'fete_des_meres',
	'fete_des_peres',
	'mariage',
	'naissance',
	'generique'
]);

export const reservationStatus = pgEnum('reservation_status', ['reserve', 'achete']);
export const loginKind = pgEnum('login_kind', ['pin', 'admin']);

export type NotifyPrefs = {
	new_list: boolean;
	new_wish: boolean;
	shared_funded: boolean;
	event_reminder: boolean;
};

export type LinkPreview = {
	title?: string;
	site_name?: string;
	image_photo_id?: string;
	fetched_at?: string;
};

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const appUser = pgTable(
	'app_user',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		displayName: text('display_name').notNull(),
		loginName: text('login_name').notNull(),
		pinHash: text('pin_hash').notNull(),
		pinEnc: bytea('pin_enc'),
		pinSetAt: ts('pin_set_at').notNull().defaultNow(),
		failedPinCount: smallint('failed_pin_count').notNull().default(0),
		lockLevel: smallint('lock_level').notNull().default(0),
		lockedUntil: ts('locked_until'),
		isActive: boolean('is_active').notNull().default(true),
		lastLoginAt: ts('last_login_at'),
		notifyPrefs: jsonb('notify_prefs')
			.$type<NotifyPrefs>()
			.notNull()
			.default(
				sql`'{"new_list":true,"new_wish":false,"shared_funded":true,"event_reminder":true}'::jsonb`
			),
		createdAt: ts('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('app_user_login_name_uq').on(sql`lower(${t.loginName})`),
		check('app_user_display_name_len', sql`char_length(${t.displayName}) BETWEEN 1 AND 60`)
	]
);

export const adminAccount = pgTable(
	'admin_account',
	{
		id: smallint('id').primaryKey().default(1),
		username: text('username').notNull(),
		passwordHash: text('password_hash').notNull(),
		totpSecretEnc: bytea('totp_secret_enc'),
		totpConfirmed: boolean('totp_confirmed').notNull().default(false),
		recoveryCodes: text('recovery_codes').array().notNull().default(sql`'{}'::text[]`),
		linkedUserId: uuid('linked_user_id').references(() => appUser.id, { onDelete: 'set null' }),
		createdAt: ts('created_at').notNull().defaultNow(),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [check('admin_account_singleton', sql`${t.id} = 1`)]
);

export const appGroup = pgTable(
	'app_group',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		description: text('description'),
		icon: text('icon'),
		accent: text('accent').notNull().default('brique'),
		archivedAt: ts('archived_at'),
		createdAt: ts('created_at').notNull().defaultNow()
	},
	(t) => [
		check('app_group_name_len', sql`char_length(${t.name}) BETWEEN 1 AND 80`),
		check(
			'app_group_description_len',
			sql`${t.description} IS NULL OR char_length(${t.description}) <= 500`
		),
		check(
			'app_group_accent',
			sql`${t.accent} IN ('brique', 'sapin', 'or', 'corail', 'sarcelle', 'soleil')`
		)
	]
);

export const groupMember = pgTable(
	'group_member',
	{
		groupId: uuid('group_id')
			.notNull()
			.references(() => appGroup.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		label: text('label'),
		joinedAt: ts('joined_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.groupId, t.userId] }),
		index('group_member_user_idx').on(t.userId),
		check('group_member_label_len', sql`${t.label} IS NULL OR char_length(${t.label}) <= 40`)
	]
);

export const wishList = pgTable(
	'wish_list',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		groupId: uuid('group_id')
			.notNull()
			.references(() => appGroup.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		theme: listTheme('theme').notNull().default('generique'),
		eventDate: date('event_date', { mode: 'string' }),
		revealAfterEvent: boolean('reveal_after_event').notNull().default(false),
		recipientId: uuid('recipient_id').references(() => appUser.id, { onDelete: 'set null' }),
		createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
		archivedAt: ts('archived_at'),
		createdAt: ts('created_at').notNull().defaultNow()
	},
	(t) => [
		index('wish_list_group_idx')
			.on(t.groupId)
			.where(sql`${t.archivedAt} IS NULL`),
		check('wish_list_title_len', sql`char_length(${t.title}) BETWEEN 1 AND 100`)
	]
);

export const photo = pgTable(
	'photo',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		storageKey: text('storage_key').notNull().unique(),
		source: text('source').notNull(),
		width: integer('width'),
		height: integer('height'),
		bytes: integer('bytes'),
		uploadedBy: uuid('uploaded_by').references(() => appUser.id, { onDelete: 'set null' }),
		createdAt: ts('created_at').notNull().defaultNow()
	},
	(t) => [check('photo_source', sql`${t.source} IN ('upload', 'link_preview')`)]
);

export const wish = pgTable(
	'wish',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		listId: uuid('list_id')
			.notNull()
			.references(() => wishList.id, { onDelete: 'cascade' }),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		url: text('url'),
		description: text('description'),
		priority: smallint('priority').notNull().default(2),
		position: integer('position').notNull().default(0),
		isSurprise: boolean('is_surprise').notNull().default(false),
		photoId: uuid('photo_id').references(() => photo.id, { onDelete: 'set null' }),
		linkPreview: jsonb('link_preview').$type<LinkPreview>(),
		isShared: boolean('is_shared').notNull().default(false),
		targetAmountCents: integer('target_amount_cents'),
		fundedAt: ts('funded_at'),
		organizerId: uuid('organizer_id').references(() => appUser.id, { onDelete: 'set null' }),
		purchasedAt: ts('purchased_at'),
		createdAt: ts('created_at').notNull().defaultNow(),
		updatedAt: ts('updated_at').notNull().defaultNow(),
		deletedAt: ts('deleted_at'),
		idempotencyKey: text('idempotency_key')
	},
	(t) => [
		index('wish_list_owner_idx')
			.on(t.listId, t.ownerId, t.position)
			.where(sql`${t.deletedAt} IS NULL`),
		uniqueIndex('wish_idempotency_key_uq')
			.on(t.idempotencyKey)
			.where(sql`${t.idempotencyKey} IS NOT NULL`),
		check('wish_title_len', sql`char_length(${t.title}) BETWEEN 1 AND 200`),
		check(
			'wish_url_http',
			sql`${t.url} IS NULL OR (${t.url} ~* '^https?://' AND char_length(${t.url}) <= 2048)`
		),
		check(
			'wish_description_len',
			sql`${t.description} IS NULL OR char_length(${t.description}) <= 4000`
		),
		check('wish_priority', sql`${t.priority} BETWEEN 1 AND 3`),
		check(
			'wish_target_positive',
			sql`${t.targetAmountCents} IS NULL OR ${t.targetAmountCents} > 0`
		),
		check('wish_target_requires_shared', sql`${t.targetAmountCents} IS NULL OR ${t.isShared}`)
	]
);

export const reservation = pgTable(
	'reservation',
	{
		wishId: uuid('wish_id')
			.primaryKey()
			.references(() => wish.id, { onDelete: 'cascade' }),
		buyerId: uuid('buyer_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		status: reservationStatus('status').notNull().default('reserve'),
		buyerNote: text('buyer_note'),
		wishUpdatedAfter: boolean('wish_updated_after').notNull().default(false),
		createdAt: ts('created_at').notNull().defaultNow(),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [
		index('reservation_buyer_idx').on(t.buyerId),
		check('reservation_note_len', sql`${t.buyerNote} IS NULL OR char_length(${t.buyerNote}) <= 500`)
	]
);

export const contribution = pgTable(
	'contribution',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		wishId: uuid('wish_id')
			.notNull()
			.references(() => wish.id, { onDelete: 'cascade' }),
		memberId: uuid('member_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		amountCents: integer('amount_cents'),
		fractionNum: smallint('fraction_num'),
		fractionDen: smallint('fraction_den'),
		createdAt: ts('created_at').notNull().defaultNow(),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('contribution_wish_member_uq').on(t.wishId, t.memberId),
		index('contribution_member_idx').on(t.memberId),
		check('contribution_amount_positive', sql`${t.amountCents} IS NULL OR ${t.amountCents} > 0`),
		check('contribution_fraction_num', sql`${t.fractionNum} IS NULL OR ${t.fractionNum} > 0`),
		check(
			'contribution_fraction_den',
			sql`${t.fractionDen} IS NULL OR ${t.fractionDen} BETWEEN 2 AND 20`
		),
		check(
			'contribution_amount_or_fraction',
			sql`(${t.amountCents} IS NOT NULL) <> (${t.fractionNum} IS NOT NULL)`
		),
		check(
			'contribution_fraction_pair',
			sql`(${t.fractionNum} IS NULL) = (${t.fractionDen} IS NULL)`
		),
		check(
			'contribution_fraction_bounds',
			sql`${t.fractionNum} IS NULL OR ${t.fractionNum} <= ${t.fractionDen}`
		)
	]
);

export const session = pgTable(
	'session',
	{
		tokenHash: bytea('token_hash').primaryKey(),
		userId: uuid('user_id').references(() => appUser.id, { onDelete: 'cascade' }),
		isAdmin: boolean('is_admin').notNull().default(false),
		createdAt: ts('created_at').notNull().defaultNow(),
		lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
		expiresAt: ts('expires_at').notNull(),
		ip: inet('ip'),
		userAgent: text('user_agent'),
		stepUpUntil: ts('step_up_until')
	},
	(t) => [
		index('session_expires_idx').on(t.expiresAt),
		index('session_user_idx').on(t.userId),
		check(
			'session_actor',
			sql`(${t.isAdmin} AND ${t.userId} IS NULL) OR (NOT ${t.isAdmin} AND ${t.userId} IS NOT NULL)`
		)
	]
);

export const loginAttempt = pgTable(
	'login_attempt',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		kind: loginKind('kind').notNull(),
		ip: inet('ip').notNull(),
		userId: uuid('user_id').references(() => appUser.id, { onDelete: 'cascade' }),
		success: boolean('success').notNull(),
		at: ts('at').notNull().defaultNow()
	},
	(t) => [
		index('login_attempt_ip_idx').on(t.ip, t.at),
		index('login_attempt_fail_idx')
			.on(t.at)
			.where(sql`NOT ${t.success}`),
		index('login_attempt_user_idx').on(t.userId, t.at)
	]
);

export const pushSubscription = pgTable(
	'push_subscription',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		authSecret: text('auth_secret').notNull(),
		deviceLabel: text('device_label'),
		createdAt: ts('created_at').notNull().defaultNow(),
		lastSuccessAt: ts('last_success_at'),
		failureCount: smallint('failure_count').notNull().default(0)
	},
	(t) => [index('push_subscription_user_idx').on(t.userId)]
);

export const notificationSent = pgTable(
	'notification_sent',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => appUser.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		refId: uuid('ref_id').notNull(),
		sentAt: ts('sent_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.kind, t.refId] })]
);

export const auditLog = pgTable(
	'audit_log',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		actor: text('actor').notNull(),
		action: text('action').notNull(),
		targetId: uuid('target_id'),
		details: jsonb('details').$type<Record<string, unknown>>(),
		at: ts('at').notNull().defaultNow()
	},
	(t) => [index('audit_log_at_idx').on(t.at)]
);

/** État de limitation par IP (PIN et admin), en plus du journal login_attempt. */
export const ipLock = pgTable('ip_lock', {
	ip: text('ip').primaryKey(),
	pinFailCount: smallint('pin_fail_count').notNull().default(0),
	pinWindowStartedAt: ts('pin_window_started_at'),
	pinLockLevel: smallint('pin_lock_level').notNull().default(0),
	pinLockedUntil: ts('pin_locked_until'),
	pinLastFailureAt: ts('pin_last_failure_at'),
	adminFailCount: smallint('admin_fail_count').notNull().default(0),
	adminWindowStartedAt: ts('admin_window_started_at'),
	adminLockLevel: smallint('admin_lock_level').notNull().default(0),
	adminLockedUntil: ts('admin_locked_until'),
	adminLastFailureAt: ts('admin_last_failure_at')
});

export const securityState = pgTable('security_state', {
	key: text('key').primaryKey(),
	until: ts('until'),
	note: text('note'),
	updatedAt: ts('updated_at').notNull().defaultNow()
});

export const schema = {
	appUser,
	adminAccount,
	appGroup,
	groupMember,
	wishList,
	photo,
	wish,
	reservation,
	contribution,
	session,
	loginAttempt,
	pushSubscription,
	notificationSent,
	auditLog,
	ipLock,
	securityState
};
