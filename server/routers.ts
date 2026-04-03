import { z } from "zod";
import bcrypt from "bcryptjs";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

// ============================================================
// Employee Auth Router
// ============================================================
const employeeAuthRouter = router({
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const employee = await db.getEmployeeByUsername(input.username);
      if (!employee || !employee.isActive) throw new Error("帳號或密碼錯誤");
      const valid = await bcrypt.compare(input.password, employee.password);
      if (!valid) throw new Error("帳號或密碼錯誤");
      return {
        id: employee.id,
        username: employee.username,
        fullName: employee.fullName,
        role: employee.role,
        needsSetup: employee.needsSetup,
        employeeType: employee.employeeType,
        jobTitle: employee.jobTitle,
      };
    }),

  changePassword: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const employee = await db.getEmployeeById(input.employeeId);
      if (!employee) throw new Error("員工不存在");
      const valid = await bcrypt.compare(input.currentPassword, employee.password);
      if (!valid) throw new Error("目前密碼錯誤");
      const hashed = await bcrypt.hash(input.newPassword, 10);
      await db.updateEmployee(input.employeeId, { password: hashed });
      return { success: true };
    }),

  completeSetup: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateEmployee(input.employeeId, { needsSetup: false });
      return { success: true };
    }),

  getProfile: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const employee = await db.getEmployeeById(input.employeeId);
      if (!employee) throw new Error("員工不存在");
      const { password: _, ...safe } = employee;
      return safe;
    }),
});

// ============================================================
// Attendance Router
// ============================================================
const attendanceRouter = router({
  clockIn: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      deviceId: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      locationName: z.string().optional(),
      shiftLabel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const today = new Date().toISOString().split("T")[0];
      const existing = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      const shiftLabel = input.shiftLabel || "班次1";
      const alreadyClockedIn = existing.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
      if (alreadyClockedIn) throw new Error("已打上班卡，請先打下班卡");

      const requireDevice = await db.getSetting("require_device_binding");
      if (requireDevice === "true") {
        if (!input.deviceId) throw new Error("打卡需要裝置識別碼，請使用已綁定的裝置");
        const device = await db.findDevice(input.employeeId, input.deviceId);
        if (!device) throw new Error("此裝置未綁定您的帳號，請聯絡管理員授權後再打卡");
      }

      if (input.lat && input.lng) {
        const lat = await db.getSetting("work_location_lat");
        const lng = await db.getSetting("work_location_lng");
        const radius = await db.getSetting("allowed_radius");
        if (lat && lng && radius) {
          const distance = getDistance(input.lat, input.lng, parseFloat(lat), parseFloat(lng));
          if (distance > parseFloat(radius)) {
            throw new Error(`您距離工作地點 ${Math.round(distance)} 公尺，超出允許範圍 ${radius} 公尺`);
          }
        }
      }

      const now = new Date();
      let status: "normal" | "late" | "early_leave" | "absent" = "normal";
      const schedule = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      if (schedule && schedule.shifts) {
        const shifts = schedule.shifts as Array<{ startTime: string; endTime: string; label: string }>;
        const currentShift = shifts.find(s => s.label === shiftLabel) || shifts[0];
        if (currentShift) {
          const [h, m] = currentShift.startTime.split(":").map(Number);
          const shiftStart = new Date(now);
          shiftStart.setHours(h, m, 0, 0);
          const lateThreshold = parseInt(await db.getSetting("late_threshold_minutes") || "10");
          if (now.getTime() - shiftStart.getTime() > lateThreshold * 60 * 1000) status = "late";
        }
      }

      const id = await db.createAttendance({
        employeeId: input.employeeId,
        date: today as unknown as Date,
        clockInTime: now,
        clockInLocation: input.locationName,
        clockInLat: input.lat?.toString() as unknown as any,
        clockInLng: input.lng?.toString() as unknown as any,
        shiftLabel,
        status,
      });
      return { success: true, id, time: now.toISOString(), status };
    }),

  clockOut: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      attendanceId: z.number().optional(),
      deviceId: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      locationName: z.string().optional(),
      shiftLabel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const records = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      let record;
      if (input.attendanceId) {
        record = records.find(r => r.id === input.attendanceId);
      } else {
        const shiftLabel = input.shiftLabel || "班次1";
        record = records.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
      }
      if (!record) throw new Error("找不到對應的打卡紀錄，請先打上班卡");

      // Enforce device binding on clock-out too
      const requireDeviceOut = await db.getSetting("require_device_binding");
      if (requireDeviceOut === "true") {
        if (!input.deviceId) throw new Error("打卡需要裝置識別碼，請使用已綁定的裝置");
        const device = await db.findDevice(input.employeeId, input.deviceId);
        if (!device) throw new Error("此裝置未綁定您的帳號，請聯絡管理員授權後再打卡");
      }

      if (input.lat && input.lng) {
        const lat = await db.getSetting("work_location_lat");
        const lng = await db.getSetting("work_location_lng");
        const radius = await db.getSetting("allowed_radius");
        if (lat && lng && radius) {
          const distance = getDistance(input.lat, input.lng, parseFloat(lat), parseFloat(lng));
          if (distance > parseFloat(radius)) {
            throw new Error(`您距離工作地點 ${Math.round(distance)} 公尺，超出允許範圍 ${radius} 公尺`);
          }
        }
      }

      let status = record.status;
      const schedule = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      if (schedule && schedule.shifts) {
        const shifts = schedule.shifts as Array<{ startTime: string; endTime: string; label: string }>;
        const currentShift = shifts.find(s => s.label === record.shiftLabel) || shifts[0];
        if (currentShift) {
          const [h, m] = currentShift.endTime.split(":").map(Number);
          const shiftEnd = new Date(now);
          shiftEnd.setHours(h, m, 0, 0);
          if (now < shiftEnd) status = "early_leave";
        }
      }

      await db.updateAttendance(record.id, {
        clockOutTime: now,
        clockOutLocation: input.locationName,
        clockOutLat: input.lat?.toString() as unknown as any,
        clockOutLng: input.lng?.toString() as unknown as any,
        status: status || "normal",
      });
      return { success: true, time: now.toISOString() };
    }),

  getToday: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const today = new Date().toISOString().split("T")[0];
      const result = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      return result ?? [];
    }),

  getHistory: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return db.getAttendanceByEmployee(input.employeeId, input.startDate, input.endDate);
    }),

  getAll: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.getAllAttendance(input.startDate, input.endDate, input.employeeId);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAttendance(input.id);
      return { success: true };
    }),

  deleteBatch: publicProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.deleteAttendanceBatch(input.ids);
      return { success: true };
    }),

  todaySummary: publicProcedure.query(async () => {
    const result = await db.getTodayAttendanceSummary();
    return result ?? { total: 0, clockedIn: 0, late: 0 };
  }),
});

// ============================================================
// Employees Router (Admin)
// ============================================================
const employeesRouter = router({
  list: publicProcedure.query(async () => {
    const list = await db.getAllEmployees();
    return list.map(({ password: _, ...e }) => e);
  }),

  create: publicProcedure
    .input(z.object({
      username: z.string().min(2).max(64),
      password: z.string().min(6),
      fullName: z.string().min(1).max(128),
      role: z.enum(["admin", "employee"]).default("employee"),
      employeeType: z.enum(["full_time", "part_time"]).default("full_time"),
      jobTitle: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.getEmployeeByUsername(input.username);
      if (existing) throw new Error("帳號已存在");
      const hashed = await bcrypt.hash(input.password, 10);
      const id = await db.createEmployee({ ...input, password: hashed, needsSetup: true, isActive: true });
      return { success: true, id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().min(1).max(128).optional(),
      role: z.enum(["admin", "employee"]).optional(),
      employeeType: z.enum(["full_time", "part_time"]).optional(),
      jobTitle: z.string().optional(),
      phone: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateEmployee(id, data);
      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({
      id: z.number(),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const hashed = await bcrypt.hash(input.newPassword, 10);
      await db.updateEmployee(input.id, { password: hashed, needsSetup: true });
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteEmployee(input.id);
      await db.deleteDevicesByEmployee(input.id);
      return { success: true };
    }),
});

// ============================================================
// Work Shifts Router
// ============================================================
const workShiftsRouter = router({
  list: publicProcedure.query(async () => db.getAllWorkShifts()),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      isDefaultWeekday: z.boolean().default(false),
      isDefaultHoliday: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createWorkShift({ ...input, isActive: true });
      return { success: true, id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(64).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      isDefaultWeekday: z.boolean().optional(),
      isDefaultHoliday: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateWorkShift(id, data);
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteWorkShift(input.id);
      return { success: true };
    }),
});

// ============================================================
// Schedules Router
// ============================================================
const schedulesRouter = router({
  getByEmployee: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getSchedulesByEmployee(input.employeeId, input.startDate, input.endDate);
    }),

  getToday: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const today = new Date().toISOString().split("T")[0];
      const result = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      return result ?? null;
    }),

  upsert: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      date: z.string(),
      shifts: z.array(z.object({
        startTime: z.string(),
        endTime: z.string(),
        label: z.string(),
      })),
      leaveType: z.enum(["annual", "sick", "personal", "marriage", "bereavement", "official", "other"]).nullable().optional(),
      leaveMode: z.enum(["allDay", "partial"]).nullable().optional(),
      leaveStart: z.string().nullable().optional(),
      leaveEnd: z.string().nullable().optional(),
      leaveDuration: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.upsertSchedule(input.employeeId, input.date, input.shifts, {
        leaveType: input.leaveType ?? null,
        leaveMode: input.leaveMode ?? null,
        leaveStart: input.leaveStart ?? null,
        leaveEnd: input.leaveEnd ?? null,
        leaveDuration: input.leaveDuration ?? null,
      });
      return { success: true };
    }),

  getWeekAll: publicProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      return db.getAllSchedulesByDateRange(input.startDate, input.endDate);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSchedule(input.id);
      return { success: true };
    }),
});

// ============================================================
// Devices Router
// ============================================================
const devicesRouter = router({
  getByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => db.getDevicesByEmployee(input.employeeId)),

  getAll: publicProcedure.query(async () => db.getAllDevices()),

  register: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      deviceId: z.string(),
      deviceName: z.string().optional(),
      platform: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.findDevice(input.employeeId, input.deviceId);
      if (existing) return { success: true, id: existing.id, alreadyRegistered: true };
      const id = await db.registerDevice(input);
      return { success: true, id, alreadyRegistered: false };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteDevice(input.id);
      return { success: true };
    }),
});

// ============================================================
// Settings Router
// ============================================================
const settingsRouter = router({
  getAll: publicProcedure.query(async () => {
    await db.initDefaultSettings();
    const all = await db.getAllSettings();
    const result: Record<string, string> = {};
    for (const s of all) result[s.key] = s.value;
    return result;
  }),

  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await db.setSetting(input.key, input.value);
      return { success: true };
    }),

  setBatch: publicProcedure
    .input(z.array(z.object({ key: z.string(), value: z.string() })))
    .mutation(async ({ input }) => {
      for (const s of input) await db.setSetting(s.key, s.value);
      return { success: true };
    }),
});

// ============================================================
// Leave Requests Router
// ============================================================
const leaveRouter = router({
  getByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => db.getLeaveRequestsByEmployee(input.employeeId)),

  getAll: publicProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => db.getAllLeaveRequests(input.status)),

  create: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      leaveType: z.enum(["annual", "sick", "personal", "other"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createLeaveRequest({
        ...input,
        startDate: input.startDate as unknown as Date,
        endDate: input.endDate as unknown as Date,
        status: "pending",
      });
      return { success: true, id };
    }),

  review: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["approved", "rejected"]),
      reviewedBy: z.number(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.updateLeaveRequest(input.id, {
        status: input.status,
        reviewedBy: input.reviewedBy,
        reviewNote: input.reviewNote,
      });
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteLeaveRequest(input.id);
      return { success: true };
    }),
});

// ============================================================
// Main App Router
// ============================================================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  employee: employeeAuthRouter,
  attendance: attendanceRouter,
  employees: employeesRouter,
  workShifts: workShiftsRouter,
  schedules: schedulesRouter,
  devices: devicesRouter,
  settings: settingsRouter,
  leave: leaveRouter,
});

export type AppRouter = typeof appRouter;

// Haversine distance formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
