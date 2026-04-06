import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  longtext,
  timestamp,
  varchar,
  json,
  date,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Employees table - stores employee information for the attendance system
 */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  fullName: varchar("fullName", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["admin", "employee"]).default("employee").notNull(),
  employeeType: mysqlEnum("employeeType", ["full_time", "part_time"]).default("full_time").notNull(),
  jobTitle: varchar("jobTitle", { length: 64 }),
  phone: varchar("phone", { length: 32 }),
  needsSetup: boolean("needsSetup").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  tag: mysqlEnum("tag", ["indoor", "outdoor", "supervisor"]),
  lineUserId: varchar("lineUserId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Attendance records table
 */
export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  date: date("date").notNull(),
  clockInTime: timestamp("clockInTime"),
  clockOutTime: timestamp("clockOutTime"),
  clockInLocation: varchar("clockInLocation", { length: 255 }),
  clockOutLocation: varchar("clockOutLocation", { length: 255 }),
  clockInLat: decimal("clockInLat", { precision: 10, scale: 8 }),
  clockInLng: decimal("clockInLng", { precision: 11, scale: 8 }),
  clockOutLat: decimal("clockOutLat", { precision: 10, scale: 8 }),
  clockOutLng: decimal("clockOutLng", { precision: 11, scale: 8 }),
  shiftLabel: varchar("shiftLabel", { length: 64 }),
  status: mysqlEnum("status", ["normal", "late", "early_leave", "absent"]).default("normal"),
  clockInPhoto: mediumtext("clockInPhoto"),
  clockOutPhoto: mediumtext("clockOutPhoto"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

/**
 * Work shift templates
 */
export const workShifts = mysqlTable("workShifts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  startTime: varchar("startTime", { length: 8 }).notNull(), // HH:MM format
  endTime: varchar("endTime", { length: 8 }).notNull(),
  isDefaultWeekday: boolean("isDefaultWeekday").default(false).notNull(),
  isDefaultHoliday: boolean("isDefaultHoliday").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  category: mysqlEnum("category", ["indoor", "outdoor", "pt"]).default("indoor"),
  dayType: mysqlEnum("dayType", ["weekday", "holiday", "both"]).default("both"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkShift = typeof workShifts.$inferSelect;
export type InsertWorkShift = typeof workShifts.$inferInsert;

/**
 * Employee schedules - daily shift assignments
 */
export const schedules = mysqlTable("schedules", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  date: date("date").notNull(),
  shifts: json("shifts").notNull().$type<Array<{ startTime: string; endTime: string; label: string }>>(),
  // Leave fields - null means no leave on this day
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "personal", "marriage", "bereavement", "official", "other"]),
  leaveMode: mysqlEnum("leaveMode", ["allDay", "partial"]),
  leaveStart: varchar("leaveStart", { length: 8 }), // HH:MM
  leaveEnd: varchar("leaveEnd", { length: 8 }),   // HH:MM
  leaveDuration: decimal("leaveDuration", { precision: 4, scale: 1 }), // hours, e.g. 4.0
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

/**
 * Registered devices for clock-in
 * status: approved = active, pending = awaiting admin approval, rejected = denied
 */
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  deviceId: varchar("deviceId", { length: 255 }).notNull(),
  deviceName: varchar("deviceName", { length: 128 }),
  platform: varchar("platform", { length: 32 }),
  status: mysqlEnum("status", ["approved", "pending", "rejected"]).default("approved").notNull(),
  registeredAt: timestamp("registeredAt").defaultNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

/**
 * System settings (key-value store)
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

/**
 * Leave requests
 */
export const leaveRequests = mysqlTable("leaveRequests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "personal", "other"]).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

/**
 * Punch correction requests - employees submit when they missed a clock-in/out
 */
export const punchCorrections = mysqlTable("punchCorrections", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  date: date("date").notNull(),
  type: mysqlEnum("type", ["clock_in", "clock_out", "both"]).notNull(),
  requestedClockIn: varchar("requestedClockIn", { length: 8 }),   // HH:MM
  requestedClockOut: varchar("requestedClockOut", { length: 8 }),  // HH:MM
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PunchCorrection = typeof punchCorrections.$inferSelect;
export type InsertPunchCorrection = typeof punchCorrections.$inferInsert;

/**
 * Web Push subscriptions - stores browser push subscription endpoints
 * employeeId = null means admin subscription; non-null = employee subscription for clock-in reminders
 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  employeeId: int("employeeId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * LINE OTP codes - temporary one-time passwords sent via LINE Bot
 */
export const lineOtpCodes = mysqlTable("lineOtpCodes", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LineOtpCode = typeof lineOtpCodes.$inferSelect;
export type InsertLineOtpCode = typeof lineOtpCodes.$inferInsert;

/**
 * Employee feedback - bug reports and suggestions with optional screenshot
 */
export const feedbacks = mysqlTable("feedbacks", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  type: mysqlEnum("type", ["bug", "suggestion", "other"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  screenshotBase64: longtext("screenshotBase64"),
  status: mysqlEnum("status", ["pending", "reviewing", "resolved", "closed"]).default("pending").notNull(),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;
