ALTER TABLE `projects` ADD `owner_kind` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `owner_plugin_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_owner_plugin_idx` ON `projects` (`owner_plugin_id`) WHERE "projects"."owner_kind" = 'plugin' AND "projects"."deleted_at" IS NULL;