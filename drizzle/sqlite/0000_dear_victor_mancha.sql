CREATE TABLE `admin` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "admin_single_row" CHECK("admin"."id" = 'admin')
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admin`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_admin_id_idx` ON `sessions` (`admin_id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_public_id_unique` ON `spaces` (`public_id`);--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`role_company` text,
	`email` text,
	`rating` integer,
	`text` text NOT NULL,
	`original_text` text,
	`avatar_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `testimonials_space_status_idx` ON `testimonials` (`space_id`,`status`);