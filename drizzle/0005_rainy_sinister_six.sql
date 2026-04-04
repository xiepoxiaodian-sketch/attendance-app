CREATE TABLE `punchCorrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`date` date NOT NULL,
	`type` enum('clock_in','clock_out','both') NOT NULL,
	`requestedClockIn` varchar(8),
	`requestedClockOut` varchar(8),
	`reason` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `punchCorrections_id` PRIMARY KEY(`id`)
);
