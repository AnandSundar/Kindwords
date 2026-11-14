CREATE TABLE "admin" (
	"id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "admin_single_row" CHECK ("admin"."id" = 'admin')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "spaces_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"role_company" text,
	"email" text,
	"rating" integer,
	"text" text NOT NULL,
	"original_text" text,
	"avatar_key" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_admin_id_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "testimonials_space_status_idx" ON "testimonials" USING btree ("space_id","status");