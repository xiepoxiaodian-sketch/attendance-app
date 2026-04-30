import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  employees,
  attendance,
  workShifts,
  schedules,
  devices,
  settings,
  leaveRequests,
  punchCorrections,
  pushSubscriptions,
  lineOtpCodes,
  feedbacks,
  InsertEmployee,
  InsertAttendance,
  InsertWorkShift,
  InsertSchedule,
  InsertDevice,
  InsertLeaveRequest,
  InsertPunchCorrection,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

// ============================================================
// Employees
// ============================================================

export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];
  // Sort: if sortOrder all same (0), fall back to username numeric order
  const all = await db.select().from(employees);
  const allSameOrder = all.length > 0 && all.every(e => e.sortOrder === all[0].sortOrder);
  if (allSameOrder) {
    return all.sort((a, b) => a.username.localeCompare(b.username, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return db.select().from(employees).orderBy(employees.sortOrder, employees.username);
}

export async function getActiveEmployees() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(employees).where(eq(employees.isActive, true));
  const allSameOrder = all.length > 0 && all.every(e => e.sortOrder === all[0].sortOrder);
  if (allSameOrder) {
    return all.sort((a, b) => a.username.localeCompare(b.username, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return all.sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.username.localeCompare(b.username, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function reorderEmployees(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await Promise.all(orderedIds.map((id, index) =>
    db.update(employees).set({ sortOrder: index }).where(eq(employees.id, id))
  ));
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Assign sortOrder based on username numeric value so default order matches account number
  const usernameNum = parseInt(data.username.replace(/\D/g, ""), 10);
  const sortOrderVal = isNaN(usernameNum) ? 9999 : usernameNum;
  const result = await db.insert(employees).values({ ...data, sortOrder: sortOrderVal });
  return result[0].insertId;
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function getEmployeeByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.username, username)).limit(1);
  return result[0];
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set(data).where(eq(employees.id, id));
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(employees).where(eq(employees.id, id));
}

export async function getEmployeeByLineUserId(lineUserId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.lineUserId, lineUserId)).limit(1);
  return result[0];
}

export async function updateEmployeeLineUserId(id: number, lineUserId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ lineUserId } as any).where(eq(employees.id, id));
}

// ============================================================
// Attendance
// ============================================================

export async function getAttendanceByEmployeeAndDate(employeeId: number, date: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attendance)
    .where(and(eq(attendance.employeeId, employeeId), sql`DATE(${attendance.date}) = ${date}`))
    .orderBy(attendance.clockInTime);
}

export async function getAttendanceByEmployee(employeeId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(attendance.employeeId, employeeId)];
  if (startDate) conditions.push(sql`DATE(${attendance.date}) >= ${startDate}`);
  if (endDate) conditions.push(sql`DATE(${attendance.date}) <= ${endDate}`);
  return db.select().from(attendance).where(and(...conditions)).orderBy(desc(attendance.date));
}

export async function getAllAttendance(startDate?: string, endDate?: string, employeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (startDate) conditions.push(sql`DATE(${attendance.date}) >= ${startDate}`);
  if (endDate) conditions.push(sql`DATE(${attendance.date}) <= ${endDate}`);
  if (employeeId) conditions.push(eq(attendance.employeeId, employeeId));
  const baseQuery = db.select({
    id: attendance.id,
    employeeId: attendance.employeeId,
    date: attendance.date,
    clockInTime: attendance.clockInTime,
    clockOutTime: attendance.clockOutTime,
    clockInLocation: attendance.clockInLocation,
    clockOutLocation: attendance.clockOutLocation,
    clockInPhoto: attendance.clockInPhoto,
    clockOutPhoto: attendance.clockOutPhoto,
    shiftLabel: attendance.shiftLabel,
    status: attendance.status,
    note: attendance.note,
    createdAt: attendance.createdAt,
    employeeName: employees.fullName,
    employeeUsername: employees.username,
  }).from(attendance).leftJoin(employees, eq(attendance.employeeId, employees.id));
  if (conditions.length > 0) {
    return baseQuery.where(and(...conditions)).orderBy(desc(attendance.date));
  }
  return baseQuery.orderBy(desc(attendance.date));
}

export async function createAttendance(data: InsertAttendance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attendance).values(data);
  return result[0].insertId;
}

export async function updateAttendance(id: number, data: Partial<InsertAttendance>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(attendance).set(data).where(eq(attendance.id, id));
}

export async function deleteAttendance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(attendance).where(eq(attendance.id, id));
}

export async function deleteAttendanceBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const id of ids) {
    await db.delete(attendance).where(eq(attendance.id, id));
  }
}

export async function getTodayAttendanceSummary() {
  const db = await getDb();
  if (!db) return { total: 0, clockedIn: 0, late: 0 };
  // Use Taiwan timezone (UTC+8) for today's date
  const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const today = twNow.toISOString().split("T")[0];
  const todayRecords = await db.select().from(attendance)
    .where(sql`DATE(${attendance.date}) = ${today}`);
  const totalResult = await db.select({ count: sql<number>`count(*)` }).from(employees)
    .where(eq(employees.isActive, true));
  return {
    total: Number(totalResult[0]?.count ?? 0),
    clockedIn: todayRecords.filter(r => r.clockInTime).length,
    late: todayRecords.filter(r => r.status === "late").length,
  };
}

// ============================================================
// Work Shifts
// ============================================================

export async function getAllWorkShifts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workShifts).orderBy(workShifts.sortOrder, workShifts.createdAt);
}

export async function getActiveWorkShifts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workShifts).where(eq(workShifts.isActive, true)).orderBy(workShifts.sortOrder, workShifts.createdAt);
}

export async function createWorkShift(data: InsertWorkShift) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Assign sortOrder = current max + 1 so new shifts go to the end
  const existing = await db.select({ sortOrder: workShifts.sortOrder }).from(workShifts).orderBy(workShifts.sortOrder);
  const maxOrder = existing.length > 0 ? Math.max(...existing.map(s => s.sortOrder)) : -1;
  const result = await db.insert(workShifts).values({ ...data, sortOrder: maxOrder + 1 });
  return result[0].insertId;
}

export async function reorderWorkShifts(orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await Promise.all(orderedIds.map((id, index) =>
    db.update(workShifts).set({ sortOrder: index }).where(eq(workShifts.id, id))
  ));
}

export async function updateWorkShift(id: number, data: Partial<InsertWorkShift>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workShifts).set(data).where(eq(workShifts.id, id));
}

export async function deleteWorkShift(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workShifts).where(eq(workShifts.id, id));
}

// ============================================================
// Schedules
// ============================================================

export async function getScheduleByEmployeeAndDate(employeeId: number, date: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(schedules)
    .where(and(eq(schedules.employeeId, employeeId), sql`DATE(${schedules.date}) = ${date}`))
    .limit(1);
  return result[0];
}

export async function getSchedulesByEmployee(employeeId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(schedules)
    .where(and(
      eq(schedules.employeeId, employeeId),
      sql`DATE(${schedules.date}) >= ${startDate}`,
      sql`DATE(${schedules.date}) <= ${endDate}`
    ));
}

export async function getAllSchedulesByDateRange(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(schedules)
    .where(and(
      sql`DATE(${schedules.date}) >= ${startDate}`,
      sql`DATE(${schedules.date}) <= ${endDate}`
    ));
}

type LeaveInfo = {
  leaveType: "annual" | "sick" | "personal" | "marriage" | "bereavement" | "official" | "other" | null;
  leaveMode: "allDay" | "partial" | null;
  leaveStart: string | null;
  leaveEnd: string | null;
  leaveDuration: number | null;
};

export async function upsertSchedule(
  employeeId: number,
  date: string,
  shifts: Array<{ startTime: string; endTime: string; label: string }>,
  leave?: LeaveInfo
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const leaveFields = leave ? {
    leaveType: leave.leaveType,
    leaveMode: leave.leaveMode,
    leaveStart: leave.leaveStart,
    leaveEnd: leave.leaveEnd,
    leaveDuration: leave.leaveDuration !== null && leave.leaveDuration !== undefined ? String(leave.leaveDuration) : null,
  } : {};
  const existing = await getScheduleByEmployeeAndDate(employeeId, date);
  if (existing) {
    await db.update(schedules).set({ shifts, ...leaveFields }).where(eq(schedules.id, existing.id));
  } else {
    await db.insert(schedules).values({ employeeId, date: date as unknown as Date, shifts, ...leaveFields });
  }
}

export async function deleteSchedule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schedules).where(eq(schedules.id, id));
}

// ============================================================
// Devices
// ============================================================

export async function getDevicesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).where(eq(devices.employeeId, employeeId));
}

export async function getAllDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: devices.id,
    employeeId: devices.employeeId,
    deviceId: devices.deviceId,
    deviceName: devices.deviceName,
    platform: devices.platform,
    status: devices.status,
    registeredAt: devices.registeredAt,
    employeeName: employees.fullName,
    employeeJobTitle: employees.jobTitle,
    employeeRole: employees.role,
  }).from(devices).leftJoin(employees, eq(devices.employeeId, employees.id));
}

export async function getPendingDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: devices.id,
    employeeId: devices.employeeId,
    deviceId: devices.deviceId,
    deviceName: devices.deviceName,
    platform: devices.platform,
    status: devices.status,
    registeredAt: devices.registeredAt,
    employeeName: employees.fullName,
    employeeJobTitle: employees.jobTitle,
  }).from(devices)
    .leftJoin(employees, eq(devices.employeeId, employees.id))
    .where(eq(devices.status, "pending"));
}

export async function updateDeviceStatus(id: number, status: "approved" | "pending" | "rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(devices).set({ status }).where(eq(devices.id, id));
}

export async function countApprovedDevicesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return 0;
  // Count devices that are approved OR have NULL status (legacy devices before status field was added)
  const result = await db.select().from(devices)
    .where(and(
      eq(devices.employeeId, employeeId),
      or(eq(devices.status, "approved"), isNull(devices.status))
    ));
  return result.length;
}

export async function findDevice(employeeId: number, deviceId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(devices)
    .where(and(eq(devices.employeeId, employeeId), eq(devices.deviceId, deviceId)))
    .limit(1);
  return result[0];
}

export async function registerDevice(data: InsertDevice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devices).values(data);
  return result[0].insertId;
}

export async function deleteDevice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devices).where(eq(devices.id, id));
}

export async function deleteDevicesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devices).where(eq(devices.employeeId, employeeId));
}

// ============================================================
// Settings
// ============================================================

export async function getSetting(key: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function getAllSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(settings);
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(settings).values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function initDefaultSettings() {
  const defaults = [
    { key: "company_name", value: "我的公司" },
    { key: "work_location_lat", value: "25.0330" },
    { key: "work_location_lng", value: "121.5654" },
    { key: "allowed_radius", value: "200" },
    { key: "require_device_binding", value: "true" },
    { key: "require_biometric", value: "true" },
    { key: "late_threshold_minutes", value: "10" },
  ];
  for (const s of defaults) {
    const existing = await getSetting(s.key);
    if (!existing) await setSetting(s.key, s.value);
  }
}

// ============================================================
// Leave Requests
// ============================================================

export async function getLeaveRequestsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leaveRequests)
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.createdAt));
}

export async function getAllLeaveRequests(status?: string) {
  const db = await getDb();
  if (!db) return [];
  const baseQuery = db.select({
    id: leaveRequests.id,
    employeeId: leaveRequests.employeeId,
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    leaveType: leaveRequests.leaveType,
    reason: leaveRequests.reason,
    status: leaveRequests.status,
    reviewedBy: leaveRequests.reviewedBy,
    reviewNote: leaveRequests.reviewNote,
    createdAt: leaveRequests.createdAt,
    updatedAt: leaveRequests.updatedAt,
    employeeName: employees.fullName,
  }).from(leaveRequests)
    .leftJoin(employees, eq(leaveRequests.employeeId, employees.id));
  if (status) {
    return baseQuery.where(eq(leaveRequests.status, status as "pending" | "approved" | "rejected"))
      .orderBy(desc(leaveRequests.createdAt));
  }
  return baseQuery.orderBy(desc(leaveRequests.createdAt));
}

export async function createLeaveRequest(data: InsertLeaveRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leaveRequests).values(data);
  return result[0].insertId;
}

export async function updateLeaveRequest(id: number, data: Partial<InsertLeaveRequest>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id));
}

export async function deleteLeaveRequest(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leaveRequests).where(eq(leaveRequests.id, id));
}

// ─── Punch Correction Functions ────────────────────────────────────────────

export async function createPunchCorrection(data: {
  employeeId: number;
  date: string;
  type: "clock_in" | "clock_out" | "both";
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  screenshotBase64?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(punchCorrections).values({
    employeeId: data.employeeId,
    date: data.date as unknown as Date,
    type: data.type,
    requestedClockIn: data.requestedClockIn ?? null,
    requestedClockOut: data.requestedClockOut ?? null,
    reason: data.reason,
    screenshotBase64: data.screenshotBase64 ?? null,
    status: "pending",
  });
  return result[0].insertId;
}

export async function getPunchCorrectionsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(punchCorrections)
    .where(eq(punchCorrections.employeeId, employeeId))
    .orderBy(desc(punchCorrections.createdAt));
}

export async function getAllPunchCorrections(status?: "pending" | "approved" | "rejected") {
  const db = await getDb();
  if (!db) return [];
  const allEmployees = await db.select({ id: employees.id, fullName: employees.fullName, username: employees.username }).from(employees);
  const empMap = new Map(allEmployees.map(e => [e.id, e]));
  const conditions = status ? [eq(punchCorrections.status, status)] : [];
  const rows = await db.select().from(punchCorrections)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(punchCorrections.createdAt));
  return rows.map(r => ({
    ...r,
    employee: empMap.get(r.employeeId) ?? null,
  }));
}

export async function reviewPunchCorrection(
  id: number,
  reviewedBy: number,
  status: "approved" | "rejected",
  reviewNote?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(punchCorrections)
    .set({ status, reviewedBy, reviewNote: reviewNote ?? null })
    .where(eq(punchCorrections.id, id));

  if (status === "approved") {
    // Auto-apply the correction to attendance record
    const [req] = await db.select().from(punchCorrections).where(eq(punchCorrections.id, id));
    if (!req) return;
    // Use Taiwan timezone: get date string safely
    const getTWDateStr = (d: Date | string): string => {
      const date = typeof d === "string" ? new Date(d) : d;
      const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      return tw.toISOString().split("T")[0];
    };
    const dateStr = typeof req.date === "string" ? (req.date as string).slice(0, 10) : getTWDateStr(req.date as Date);
    const existing = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, req.employeeId), sql`DATE(${attendance.date}) = ${dateStr}`))
      .limit(1);

    // IMPORTANT: append +08:00 so Node.js parses as Taiwan local time, not UTC
    // Without timezone suffix, "2026-04-05T14:30:00" is treated as UTC → stored as UTC
    // → when read back and displayed in TW time, shows as 22:30 instead of 14:30
    const toDateTime = (dateStr: string, timeStr: string) => {
      return new Date(`${dateStr}T${timeStr}:00+08:00`);
    };

    if (existing.length > 0) {
      const record = existing[0];
      const updates: Partial<InsertAttendance> = {};
      if ((req.type === "clock_in" || req.type === "both") && req.requestedClockIn) {
        updates.clockInTime = toDateTime(dateStr, req.requestedClockIn);
      }
      if ((req.type === "clock_out" || req.type === "both") && req.requestedClockOut) {
        updates.clockOutTime = toDateTime(dateStr, req.requestedClockOut);
      }
      updates.note = `[補打卡已核准] ${req.reason}`;
      await db.update(attendance).set(updates).where(eq(attendance.id, record.id));
    } else {
      // Create new attendance record
      const newRecord: InsertAttendance = {
        employeeId: req.employeeId,
        date: req.date as unknown as Date,
        note: `[補打卡已核准] ${req.reason}`,
      };
      if ((req.type === "clock_in" || req.type === "both") && req.requestedClockIn) {
        newRecord.clockInTime = toDateTime(dateStr, req.requestedClockIn);
      }
      if ((req.type === "clock_out" || req.type === "both") && req.requestedClockOut) {
        newRecord.clockOutTime = toDateTime(dateStr, req.requestedClockOut);
      }
      await db.insert(attendance).values(newRecord);
    }
  }
}

// ============================================================
// Push Subscriptions
// ============================================================
export async function savePushSubscription(data: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  employeeId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint));
  if (existing.length > 0) {
    await db.update(pushSubscriptions)
      .set({ p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent, employeeId: data.employeeId ?? null })
      .where(eq(pushSubscriptions.endpoint, data.endpoint));
  } else {
    await db.insert(pushSubscriptions).values(data);
  }
}

export async function deletePushSubscription(endpoint: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getAllPushSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions);
}

/** Get push subscriptions for a specific employee */
export async function getPushSubscriptionsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.employeeId, employeeId));
}

/** Get admin push subscriptions (employeeId IS NULL) */
export async function getAdminPushSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions)
    .where(isNull(pushSubscriptions.employeeId));
}

// ============================================================
// LINE OTP Codes
// ============================================================

/** Generate a 6-digit OTP code and store it in the database (expires in 5 minutes) */
export async function createLineOtp(employeeId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Invalidate any existing unused OTPs for this employee
  await db.update(lineOtpCodes)
    .set({ used: true })
    .where(and(eq(lineOtpCodes.employeeId, employeeId), eq(lineOtpCodes.used, false)));
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await db.insert(lineOtpCodes).values({ employeeId, code, expiresAt, used: false });
  return code;
}

/** Verify an OTP code for an employee. Returns true if valid and marks it as used. */
export async function verifyLineOtp(employeeId: number, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const result = await db.select().from(lineOtpCodes)
    .where(and(
      eq(lineOtpCodes.employeeId, employeeId),
      eq(lineOtpCodes.code, code),
      eq(lineOtpCodes.used, false),
      gte(lineOtpCodes.expiresAt, now)
    ))
    .limit(1);
  if (result.length === 0) return false;
  // Mark as used
  await db.update(lineOtpCodes)
    .set({ used: true })
    .where(eq(lineOtpCodes.id, result[0].id));
  return true;
}

// ============================================================
// Photo Cleanup
// ============================================================
/** Clear clockInPhoto and clockOutPhoto for attendance records older than N days */
export async function clearOldAttendancePhotos(retentionDays: number = 7): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD
  const result = await db.update(attendance)
    .set({ clockInPhoto: null, clockOutPhoto: null })
    .where(
      and(
        sql`DATE(${attendance.date}) <= ${cutoffStr}`,
        or(
          sql`${attendance.clockInPhoto} IS NOT NULL`,
          sql`${attendance.clockOutPhoto} IS NOT NULL`
        )
      )
    );
  return (result as any)[0]?.affectedRows ?? 0;
}

// ============================================================
// Feedback
// ============================================================
export async function createFeedback(data: {
  employeeId: number;
  type: "bug" | "suggestion" | "other";
  title: string;
  description: string;
  screenshotBase64?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(feedbacks).values({
    employeeId: data.employeeId,
    type: data.type,
    title: data.title,
    description: data.description,
    screenshotBase64: data.screenshotBase64 ?? null,
  });
  return (result as any)[0]?.insertId as number;
}

export async function getAllFeedbacks() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: feedbacks.id,
    employeeId: feedbacks.employeeId,
    type: feedbacks.type,
    title: feedbacks.title,
    description: feedbacks.description,
    screenshotBase64: feedbacks.screenshotBase64,
    status: feedbacks.status,
    adminNote: feedbacks.adminNote,
    createdAt: feedbacks.createdAt,
    updatedAt: feedbacks.updatedAt,
    employeeName: employees.fullName,
    employeeUsername: employees.username,
  }).from(feedbacks)
    .leftJoin(employees, eq(feedbacks.employeeId, employees.id))
    .orderBy(sql`${feedbacks.createdAt} DESC`);
}

export async function getFeedbackById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    id: feedbacks.id,
    employeeId: feedbacks.employeeId,
    type: feedbacks.type,
    title: feedbacks.title,
    description: feedbacks.description,
    screenshotBase64: feedbacks.screenshotBase64,
    status: feedbacks.status,
    adminNote: feedbacks.adminNote,
    createdAt: feedbacks.createdAt,
    updatedAt: feedbacks.updatedAt,
    employeeName: employees.fullName,
    employeeUsername: employees.username,
  }).from(feedbacks)
    .leftJoin(employees, eq(feedbacks.employeeId, employees.id))
    .where(eq(feedbacks.id, id));
  return result[0] ?? null;
}

export async function updateFeedbackStatus(
  id: number,
  status: "pending" | "reviewing" | "resolved" | "closed",
  adminNote?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(feedbacks)
    .set({ status, ...(adminNote !== undefined ? { adminNote } : {}) })
    .where(eq(feedbacks.id, id));
}

export async function getFeedbacksByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: feedbacks.id,
    type: feedbacks.type,
    title: feedbacks.title,
    description: feedbacks.description,
    screenshotBase64: feedbacks.screenshotBase64,
    status: feedbacks.status,
    adminNote: feedbacks.adminNote,
    createdAt: feedbacks.createdAt,
    updatedAt: feedbacks.updatedAt,
  }).from(feedbacks)
    .where(eq(feedbacks.employeeId, employeeId))
    .orderBy(sql`${feedbacks.createdAt} DESC`);
}
