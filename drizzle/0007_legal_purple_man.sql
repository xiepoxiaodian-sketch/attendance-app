ALTER TABLE `workShifts` ADD `category` enum('indoor','outdoor','pt') DEFAULT 'indoor';--> statement-breakpoint
ALTER TABLE `workShifts` ADD `dayType` enum('weekday','holiday','both') DEFAULT 'both';