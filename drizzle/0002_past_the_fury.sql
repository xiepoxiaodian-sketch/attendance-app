ALTER TABLE `schedules` ADD `leaveType` enum('annual','sick','personal','marriage','bereavement','official','other');--> statement-breakpoint
ALTER TABLE `schedules` ADD `leaveMode` enum('allDay','partial');--> statement-breakpoint
ALTER TABLE `schedules` ADD `leaveStart` varchar(8);--> statement-breakpoint
ALTER TABLE `schedules` ADD `leaveEnd` varchar(8);--> statement-breakpoint
ALTER TABLE `schedules` ADD `leaveDuration` decimal(4,1);