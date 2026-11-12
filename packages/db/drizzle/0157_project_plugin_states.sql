CREATE TABLE IF NOT EXISTS `project_plugin_states` (
	`project_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `plugin_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
