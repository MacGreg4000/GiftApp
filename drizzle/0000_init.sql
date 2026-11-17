CREATE TYPE "public"."list_theme" AS ENUM('noel', 'saint_nicolas', 'anniversaire', 'paques', 'fete_des_meres', 'fete_des_peres', 'mariage', 'naissance', 'generique');--> statement-breakpoint
CREATE TYPE "public"."login_kind" AS ENUM('pin', 'admin');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('reserve', 'achete');--> statement-breakpoint
CREATE TABLE "admin_account" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" "bytea",
	"totp_confirmed" boolean DEFAULT false NOT NULL,
	"recovery_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_account_singleton" CHECK ("admin_account"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "app_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"accent" text DEFAULT 'brique' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_group_name_len" CHECK (char_length("app_group"."name") BETWEEN 1 AND 80),
	CONSTRAINT "app_group_description_len" CHECK ("app_group"."description" IS NULL OR char_length("app_group"."description") <= 500),
	CONSTRAINT "app_group_accent" CHECK ("app_group"."accent" IN ('brique', 'sapin', 'or', 'corail', 'sarcelle', 'soleil'))
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"login_name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_pin_count" smallint DEFAULT 0 NOT NULL,
	"lock_level" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"notify_prefs" jsonb DEFAULT '{"new_list":true,"new_wish":false,"shared_funded":true,"event_reminder":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_display_name_len" CHECK (char_length("app_user"."display_name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wish_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_cents" integer,
	"fraction_num" smallint,
	"fraction_den" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_amount_positive" CHECK ("contribution"."amount_cents" IS NULL OR "contribution"."amount_cents" > 0),
	CONSTRAINT "contribution_fraction_num" CHECK ("contribution"."fraction_num" IS NULL OR "contribution"."fraction_num" > 0),
	CONSTRAINT "contribution_fraction_den" CHECK ("contribution"."fraction_den" IS NULL OR "contribution"."fraction_den" BETWEEN 2 AND 20),
	CONSTRAINT "contribution_amount_or_fraction" CHECK (("contribution"."amount_cents" IS NOT NULL) <> ("contribution"."fraction_num" IS NOT NULL)),
	CONSTRAINT "contribution_fraction_pair" CHECK (("contribution"."fraction_num" IS NULL) = ("contribution"."fraction_den" IS NULL)),
	CONSTRAINT "contribution_fraction_bounds" CHECK ("contribution"."fraction_num" IS NULL OR "contribution"."fraction_num" <= "contribution"."fraction_den")
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "group_member_label_len" CHECK ("group_member"."label" IS NULL OR char_length("group_member"."label") <= 40)
);
--> statement-breakpoint
CREATE TABLE "ip_lock" (
	"ip" text PRIMARY KEY NOT NULL,
	"pin_fail_count" smallint DEFAULT 0 NOT NULL,
	"pin_window_started_at" timestamp with time zone,
	"pin_lock_level" smallint DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"pin_last_failure_at" timestamp with time zone,
	"admin_fail_count" smallint DEFAULT 0 NOT NULL,
	"admin_window_started_at" timestamp with time zone,
	"admin_lock_level" smallint DEFAULT 0 NOT NULL,
	"admin_locked_until" timestamp with time zone,
	"admin_last_failure_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempt" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "login_kind" NOT NULL,
	"ip" "inet" NOT NULL,
	"user_id" uuid,
	"success" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_sent" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_sent_user_id_kind_ref_id_pk" PRIMARY KEY("user_id","kind","ref_id")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"source" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "photo_source" CHECK ("photo"."source" IN ('upload', 'link_preview'))
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_secret" text NOT NULL,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"wish_id" uuid PRIMARY KEY NOT NULL,
	"buyer_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'reserve' NOT NULL,
	"buyer_note" text,
	"wish_updated_after" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_note_len" CHECK ("reservation"."buyer_note" IS NULL OR char_length("reservation"."buyer_note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "security_state" (
	"key" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "session_actor" CHECK (("session"."is_admin" AND "session"."user_id" IS NULL) OR (NOT "session"."is_admin" AND "session"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "wish" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"description" text,
	"priority" smallint DEFAULT 2 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_surprise" boolean DEFAULT false NOT NULL,
	"photo_id" uuid,
	"link_preview" jsonb,
	"is_shared" boolean DEFAULT false NOT NULL,
	"target_amount_cents" integer,
	"funded_at" timestamp with time zone,
	"organizer_id" uuid,
	"purchased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wish_title_len" CHECK (char_length("wish"."title") BETWEEN 1 AND 200),
	CONSTRAINT "wish_url_http" CHECK ("wish"."url" IS NULL OR ("wish"."url" ~* '^https?://' AND char_length("wish"."url") <= 2048)),
	CONSTRAINT "wish_description_len" CHECK ("wish"."description" IS NULL OR char_length("wish"."description") <= 4000),
	CONSTRAINT "wish_priority" CHECK ("wish"."priority" BETWEEN 1 AND 3),
	CONSTRAINT "wish_target_positive" CHECK ("wish"."target_amount_cents" IS NULL OR "wish"."target_amount_cents" > 0),
	CONSTRAINT "wish_target_requires_shared" CHECK ("wish"."target_amount_cents" IS NULL OR "wish"."is_shared")
);
--> statement-breakpoint
CREATE TABLE "wish_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"theme" "list_theme" DEFAULT 'generique' NOT NULL,
	"event_date" date,
	"reveal_after_event" boolean DEFAULT false NOT NULL,
	"recipient_id" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wish_list_title_len" CHECK (char_length("wish_list"."title") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "admin_account" ADD CONSTRAINT "admin_account_linked_user_id_app_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_wish_id_wish_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wish"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_member_id_app_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_app_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."app_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempt" ADD CONSTRAINT "login_attempt_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_sent" ADD CONSTRAINT "notification_sent_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_wish_id_wish_id_fk" FOREIGN KEY ("wish_id") REFERENCES "public"."wish"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_buyer_id_app_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_list_id_wish_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."wish_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_organizer_id_app_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_list" ADD CONSTRAINT "wish_list_group_id_app_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."app_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_list" ADD CONSTRAINT "wish_list_recipient_id_app_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_list" ADD CONSTRAINT "wish_list_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_login_name_uq" ON "app_user" USING btree (lower("login_name"));--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_wish_member_uq" ON "contribution" USING btree ("wish_id","member_id");--> statement-breakpoint
CREATE INDEX "contribution_member_idx" ON "contribution" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "group_member_user_idx" ON "group_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempt_ip_idx" ON "login_attempt" USING btree ("ip","at");--> statement-breakpoint
CREATE INDEX "login_attempt_fail_idx" ON "login_attempt" USING btree ("at") WHERE NOT "login_attempt"."success";--> statement-breakpoint
CREATE INDEX "login_attempt_user_idx" ON "login_attempt" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "push_subscription_user_idx" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservation_buyer_idx" ON "reservation" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wish_list_owner_idx" ON "wish" USING btree ("list_id","owner_id","position") WHERE "wish"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "wish_list_group_idx" ON "wish_list" USING btree ("group_id") WHERE "wish_list"."archived_at" IS NULL;