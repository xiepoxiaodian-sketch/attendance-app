CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`type` enum('bug','suggestion','other') NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`screenshotBase64` longtext,
	`status` enum('pending','reviewing','resolved','closed') NOT NULL DEFAULT 'pending',
	`adminNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
