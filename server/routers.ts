import { z } from "zod";
import bcrypt from "bcryptjs";
import webpush from "web-push";

// Helper: get today's date in Taiwan timezone (UTC+8)
function getTodayTW(): string {
  const now = new Date();
  const twOffset = 8 * 60 * 60 * 1000; // UTC+8 in ms
  const twDate = new Date(now.getTime() + twOffset);
  return twDate.toISOString().split("T")[0];
}

// VAPID keys
const VAPID_PUBLIC_KEY = "BPs2MLc_pyu9-Nq3uO7tdqKisCip0hd7eAobAfDchzafO-nTBnNxqSsDILb5H75NlLaEk54Uz-KKTKkSIT1VKmQ";
const VAPID_PRIVATE_KEY = "nj757QiuhOc-r7YvA9qxwyfUwgfsOHgMIMZtm5s620g";
webpush.setVapidDetails("mailto:admin@goodwork.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Helper: send push to all subscribers
async function sendPushToAll(payload: { title: string; body: string; icon?: string }) {
  const subs = await db.getAllPushSubscriptions();
  const deadEndpoints: string[] = [];
  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadEndpoints.push(sub.endpoint);
      }
    }
  }));
  for (const ep of deadEndpoints) await db.deletePushSubscription(ep);
}
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
      photoBase64: z.string().optional(), // base64 JPEG from selfie camera
      photoTimestamp: z.number().optional(), // Unix ms when photo was taken
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate photo timestamp (must be within 30 seconds of server time)
      if (input.photoBase64 && input.photoTimestamp) {
        const age = Date.now() - input.photoTimestamp;
        if (age > 30000 || age < -5000) {
          throw new Error("照片已過期，請重新拍照後再打卡（需在 30 秒內完成）");
        }
      }
      const today = getTodayTW();
      const existing = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      const shiftLabel = input.shiftLabel || "班次1";
      const alreadyClockedIn = existing.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
      if (alreadyClockedIn) throw new Error("已打上班卡，請先打下班卡");

      // ── IP Whitelist check ─────────────────────────────────────────────────
      const requireIp = await db.getSetting("require_ip_whitelist");
      if (requireIp === "true") {
        const allowedIps = await db.getSetting("allowed_ips");
        if (allowedIps) {
          const clientIp = (ctx.req.headers["x-forwarded-for"] as string || ctx.req.socket.remoteAddress || "").split(",")[0].trim();
          const ipList = allowedIps.split(",").map((ip: string) => ip.trim()).filter(Boolean);
          if (!ipList.some((ip: string) => clientIp === ip || clientIp.startsWith(ip))) {
            throw new Error(`您目前不在公司 WiFi 網路內，無法打卡（目前 IP：${clientIp}）`);
          }
        }
      }

      // Device binding check removed - devices are auto-registered on clock-in

      // ── GPS Location check (only when require_gps is enabled) ─────────────────────────────
      const requireGps = await db.getSetting("require_gps");
      if (requireGps === "true" && input.lat && input.lng) {
        const workLat = await db.getSetting("work_location_lat");
        const workLng = await db.getSetting("work_location_lng");
        const radius = await db.getSetting("allowed_radius");
        if (workLat && workLng && radius) {
          const distance = getDistance(input.lat, input.lng, parseFloat(workLat), parseFloat(workLng));
          if (distance > parseFloat(radius)) {
            throw new Error(`您距離工作地點 ${Math.round(distance)} 公尺，超出允許範圍 ${radius} 公尺，請確認您在工作地點後再打卡`);
          }
        }
      }

      const now = new Date();
      // Use Taiwan timezone (UTC+8) for shift time comparison
      const TZ_OFFSET = 8 * 60; // minutes
      const nowTW = new Date(now.getTime() + TZ_OFFSET * 60 * 1000);
      const nowTWMinutes = nowTW.getUTCHours() * 60 + nowTW.getUTCMinutes();
      let status: "normal" | "late" | "early_leave" | "absent" = "normal";
      const schedule = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      if (schedule && schedule.shifts) {
        const shifts = schedule.shifts as Array<{ startTime: string; endTime: string; label: string }>;
        // Find the shift matching shiftLabel; if not found, find the shift whose time range covers now
        let currentShift = shifts.find(s => s.label === shiftLabel);
        if (!currentShift) {
          // Fallback: find shift closest to current time
          currentShift = shifts.reduce((best, s) => {
            const [bh, bm] = best.startTime.split(":").map(Number);
            const [sh, sm] = s.startTime.split(":").map(Number);
            const bDiff = Math.abs(bh * 60 + bm - nowTWMinutes);
            const sDiff = Math.abs(sh * 60 + sm - nowTWMinutes);
            return sDiff < bDiff ? s : best;
          }, shifts[0]);
        }
        if (currentShift) {
          const [h, m] = currentShift.startTime.split(":").map(Number);
          const shiftStartMinutes = h * 60 + m;
          const lateThreshold = parseInt(await db.getSetting("late_threshold_minutes") || "10");
          if (nowTWMinutes - shiftStartMinutes > lateThreshold) status = "late";
        }
      }

      // Store selfie photo as base64 directly in DB (no S3 dependency)
      // Limit photo size to prevent DB errors (max ~500KB base64 ≈ 375KB binary)
      let clockInPhotoUrl: string | undefined = input.photoBase64 || undefined;
      if (clockInPhotoUrl && clockInPhotoUrl.length > 600000) {
        clockInPhotoUrl = undefined; // Drop oversized photo rather than fail
      }

      let id: number;
      try {
        id = await db.createAttendance({
          employeeId: input.employeeId,
          date: today as unknown as Date,
          clockInTime: now,
          clockInLocation: input.locationName,
          clockInLat: input.lat ?? null,
          clockInLng: input.lng ?? null,
          shiftLabel,
          status,
          clockInPhoto: clockInPhotoUrl ?? null,
        } as any);
      } catch (dbErr: any) {
        // If error is due to missing location/photo columns, retry without them
        const msg = dbErr?.message || '';
        const isColumnError = msg.includes('clockInLocation') || msg.includes('clockOutLocation') || msg.includes('Unknown column');
        if (isColumnError) {
          console.warn('[clockIn] Retrying without location columns (DB schema mismatch)');
          try {
            id = await db.createAttendance({
              employeeId: input.employeeId,
              date: today as unknown as Date,
              clockInTime: now,
              clockInLat: input.lat ?? null,
              clockInLng: input.lng ?? null,
              shiftLabel,
              status,
              clockInPhoto: clockInPhotoUrl ?? null,
            } as any);
          } catch (retryErr: any) {
            console.error('[clockIn] Retry DB error:', retryErr?.message);
            throw new Error('打卡記錄儲存失敗，請稍後再試');
          }
        } else {
          // Mask raw SQL errors to avoid leaking sensitive data to client
          console.error('[clockIn] DB error:', dbErr?.message);
          throw new Error('打卡記錄儲存失敗，請稍後再試');
        }
      }

      // Push notification for late clock-in
      if (status === "late") {
        const notifyEnabled = await db.getSetting("push_notify_late");
        if (notifyEnabled === "true") {
          const employee = await db.getEmployeeById(input.employeeId);
          const name = employee?.fullName || `員工 #${input.employeeId}`;
          const timeStr = now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
          sendPushToAll({
            title: "⚠️ 遲到通知",
            body: `${name} 於 ${timeStr} 打卡上班（遲到）`,
            icon: "/favicon.png",
          }).catch(() => {});
        }
      }

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
      photoBase64: z.string().optional(), // base64 JPEG from selfie camera
      photoTimestamp: z.number().optional(), // Unix ms when photo was taken
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate photo timestamp (must be within 30 seconds of server time)
      if (input.photoBase64 && input.photoTimestamp) {
        const age = Date.now() - input.photoTimestamp;
        if (age > 30000 || age < -5000) {
          throw new Error("照片已過期，請重新拍照後再打卡（需在 30 秒內完成）");
        }
      }
      const today = getTodayTW();
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

      // ── IP Whitelist check ─────────────────────────────────────────────────
      const requireIpOut = await db.getSetting("require_ip_whitelist");
      if (requireIpOut === "true") {
        const allowedIpsOut = await db.getSetting("allowed_ips");
        if (allowedIpsOut) {
          const clientIp = (ctx.req.headers["x-forwarded-for"] as string || ctx.req.socket.remoteAddress || "").split(",")[0].trim();
          const ipList = allowedIpsOut.split(",").map((ip: string) => ip.trim()).filter(Boolean);
          if (!ipList.some((ip: string) => clientIp === ip || clientIp.startsWith(ip))) {
            throw new Error(`您目前不在公司 WiFi 網路內，無法打卡（目前 IP：${clientIp}）`);
          }
        }
      }

      // Device binding check removed - devices are auto-registered on clock-in

      // ── GPS Location check (only when require_gps is enabled) ─────────────────────────────
      const requireGpsOut = await db.getSetting("require_gps");
      if (requireGpsOut === "true" && input.lat && input.lng) {
        const workLatOut = await db.getSetting("work_location_lat");
        const workLngOut = await db.getSetting("work_location_lng");
        const radiusOut = await db.getSetting("allowed_radius");
        if (workLatOut && workLngOut && radiusOut) {
          const distance = getDistance(input.lat, input.lng, parseFloat(workLatOut), parseFloat(workLngOut));
          if (distance > parseFloat(radiusOut)) {
            throw new Error(`您距離工作地點 ${Math.round(distance)} 公尺，超出允許範圍 ${radiusOut} 公尺，請確認您在工作地點後再打卡`);
          }
        }
      }

      // Use Taiwan timezone (UTC+8) for shift time comparison
      const TZ_OFFSET_OUT = 8 * 60; // minutes
      const nowTW_out = new Date(now.getTime() + TZ_OFFSET_OUT * 60 * 1000);
      const nowTWMinutes_out = nowTW_out.getUTCHours() * 60 + nowTW_out.getUTCMinutes();
      let status = record.status;
      const schedule = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      if (schedule && schedule.shifts) {
        const shifts = schedule.shifts as Array<{ startTime: string; endTime: string; label: string }>;
        // Match by shiftLabel from the attendance record for accurate multi-shift handling
        const currentShift = shifts.find(s => s.label === record.shiftLabel) ||
          shifts.find(s => {
            // Fallback: find shift whose end time is closest to now
            const [eh, em] = s.endTime.split(":").map(Number);
            return Math.abs(eh * 60 + em - nowTWMinutes_out) < 120; // within 2 hours
          }) || shifts[0];
        if (currentShift) {
          const [h, m] = currentShift.endTime.split(":").map(Number);
          const shiftEndMinutes = h * 60 + m;
          // Early leave: clocked out more than 1 minute before shift end
          if (nowTWMinutes_out < shiftEndMinutes - 1) status = "early_leave";
          // If was previously late but clocked out on time, keep late status
          else if (record.status !== "late") status = "normal";
        }
      }

      // Store selfie photo as base64 directly in DB (no S3 dependency)
      // Limit photo size to prevent DB errors (max ~500KB base64 ≈ 375KB binary)
      let clockOutPhotoUrl: string | undefined = input.photoBase64 || undefined;
      if (clockOutPhotoUrl && clockOutPhotoUrl.length > 600000) {
        clockOutPhotoUrl = undefined; // Drop oversized photo rather than fail
      }

      try {
        await db.updateAttendance(record.id, {
          clockOutTime: now,
          clockOutLocation: input.locationName,
          clockOutLat: input.lat ?? null,
          clockOutLng: input.lng ?? null,
          status: status || "normal",
          clockOutPhoto: clockOutPhotoUrl ?? null,
        } as any);
      } catch (dbErr: any) {
        // If error is due to missing location columns, retry without them
        const msg = dbErr?.message || '';
        const isColumnError = msg.includes('clockOutLocation') || msg.includes('clockInLocation') || msg.includes('Unknown column');
        if (isColumnError) {
          console.warn('[clockOut] Retrying without location columns (DB schema mismatch)');
          try {
            await db.updateAttendance(record.id, {
              clockOutTime: now,
              clockOutLat: input.lat ?? null,
              clockOutLng: input.lng ?? null,
              status: status || "normal",
              clockOutPhoto: clockOutPhotoUrl ?? null,
            } as any);
          } catch (retryErr: any) {
            console.error('[clockOut] Retry DB error:', retryErr?.message);
            throw new Error('打卡記錄儲存失敗，請稍後再試');
          }
        } else {
          // Mask raw SQL errors to avoid leaking sensitive data to client
          console.error('[clockOut] DB error:', dbErr?.message);
          throw new Error('打卡記錄儲存失敗，請稍後再試');
        }
      }

      // Push notification for early leave
      if (status === "early_leave") {
        const notifyEnabled = await db.getSetting("push_notify_early_leave");
        if (notifyEnabled === "true") {
          const employee = await db.getEmployeeById(input.employeeId);
          const name = employee?.fullName || `員工 #${input.employeeId}`;
          const timeStr = now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
          sendPushToAll({
            title: "⚠️ 早退通知",
            body: `${name} 於 ${timeStr} 提早打卡下班`,
            icon: "/favicon.png",
          }).catch(() => {});
        }
      }

      return { success: true, time: now.toISOString() };
    }),

  getToday: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const today = getTodayTW();
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

  getGrouped: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const records = await db.getAllAttendance(input.startDate, input.endDate, input.employeeId);
      // Fetch all schedules in the date range for dynamic status recalculation
      const allSchedules = input.startDate && input.endDate
        ? await db.getAllSchedulesByDateRange(input.startDate, input.endDate)
        : [];
      // Build schedule lookup: employeeId_dateKey -> shifts[]
      const scheduleMap = new Map<string, Array<{ startTime: string; endTime: string; label: string }>>();
      for (const s of allSchedules) {
        let sDateKey = "";
        if (s.date) {
          const d = s.date instanceof Date ? s.date : new Date(s.date as unknown as string);
          if (!isNaN(d.getTime())) {
            sDateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          } else {
            sDateKey = String(s.date).split("T")[0].split(" ")[0];
          }
        }
        const sKey = `${s.employeeId}_${sDateKey}`;
        if (s.shifts) {
          scheduleMap.set(sKey, s.shifts as Array<{ startTime: string; endTime: string; label: string }>);
        }
      }
      const lateThreshold = parseInt(await db.getSetting("late_threshold_minutes") || "10");

      // Helper: compute status from clock times vs scheduled shift
      function computeStatus(
        clockIn: Date | null,
        clockOut: Date | null,
        shift: { startTime: string; endTime: string } | undefined,
        storedStatus: string | null
      ): string {
        if (!shift) return storedStatus || "normal";
        const toTWMinutes = (d: Date) => {
          const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
          return tw.getUTCHours() * 60 + tw.getUTCMinutes();
        };
        const [sh, sm] = shift.startTime.split(":").map(Number);
        const [eh, em] = shift.endTime.split(":").map(Number);
        const shiftStart = sh * 60 + sm;
        const shiftEnd = eh * 60 + em;
        let status = "normal";
        if (clockIn) {
          const inMin = toTWMinutes(clockIn instanceof Date ? clockIn : new Date(clockIn));
          if (inMin - shiftStart > lateThreshold) status = "late";
        }
        if (clockOut) {
          const outMin = toTWMinutes(clockOut instanceof Date ? clockOut : new Date(clockOut));
          if (outMin < shiftEnd - 1) {
            status = "early_leave";
          } else if (status !== "late") {
            status = "normal";
          }
        }
        return status;
      }

      // Group by employeeId + date (local date, not UTC)
      const map = new Map<string, {
        key: string;
        employeeId: number;
        employeeName: string;
        dateKey: string;
        dateRaw: any;
        shifts: Array<{
          id: number;
          shiftLabel: string;
          clockInTime: any;
          clockOutTime: any;
          status: string | null;
          note: string | null;
          clockInPhoto: string | null;
          clockOutPhoto: string | null;
          clockInLocation: string | null;
          clockOutLocation: string | null;
        }>;
      }>();
      for (const r of records) {
        // Extract local date string (YYYY-MM-DD) safely
        let dateKey = "";
        if (r.date) {
          const d = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, "0");
            const dy = String(d.getDate()).padStart(2, "0");
            dateKey = `${y}-${mo}-${dy}`;
          } else {
            dateKey = String(r.date).split("T")[0].split(" ")[0];
          }
        }
        const groupKey = `${r.employeeId}_${dateKey}`;
        // Find matching scheduled shift for dynamic status recalculation
        const shiftsForDay = scheduleMap.get(groupKey);
        const shiftLabel = r.shiftLabel || "一般班";
        const matchedShift = shiftsForDay?.find(s => s.label === shiftLabel);
        const dynamicStatus = computeStatus(
          r.clockInTime ? (r.clockInTime instanceof Date ? r.clockInTime : new Date(r.clockInTime as any)) : null,
          r.clockOutTime ? (r.clockOutTime instanceof Date ? r.clockOutTime : new Date(r.clockOutTime as any)) : null,
          matchedShift,
          r.status ?? null
        );
        if (!map.has(groupKey)) {
          map.set(groupKey, {
            key: groupKey,
            employeeId: r.employeeId,
            employeeName: (r as any).employeeName ?? `#${r.employeeId}`,
            dateKey,
            dateRaw: r.date,
            shifts: [],
          });
        }
        map.get(groupKey)!.shifts.push({
          id: r.id,
          shiftLabel,
          clockInTime: r.clockInTime,
          clockOutTime: r.clockOutTime,
          status: dynamicStatus,
          note: r.note ?? null,
          clockInPhoto: (r as any).clockInPhoto ?? null,
          clockOutPhoto: (r as any).clockOutPhoto ?? null,
          clockInLocation: r.clockInLocation ?? null,
          clockOutLocation: r.clockOutLocation ?? null,
        });
      }
      // Sort by date desc
      return Array.from(map.values()).sort((a, b) =>
        new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime()
      );
    }),

  adminUpdate: publicProcedure
    .input(z.object({
      id: z.number(),
      clockInTime: z.string().nullable().optional(),
      clockOutTime: z.string().nullable().optional(),
      note: z.string().optional(),
      status: z.enum(["normal", "late", "early_leave", "absent"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, clockInTime, clockOutTime, note, status } = input;
      const updateData: Record<string, any> = {};
      if (clockInTime !== undefined) updateData.clockInTime = clockInTime ? new Date(clockInTime) : null;
      if (clockOutTime !== undefined) updateData.clockOutTime = clockOutTime ? new Date(clockOutTime) : null;
      if (note !== undefined) updateData.note = note;
      if (status !== undefined) updateData.status = status;
      await db.updateAttendance(id, updateData);
      return { success: true };
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
      tag: z.enum(["indoor", "outdoor", "supervisor"]).optional(),
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
      tag: z.enum(["indoor", "outdoor", "supervisor"]).nullable().optional(),
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

  reorder: publicProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.reorderEmployees(input.orderedIds);
      return { success: true };
    }),

  // Admin: unbind LINE account for an employee
  unbindLine: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateEmployeeLineUserId(input.id, null);
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
      category: z.enum(["indoor", "outdoor", "pt"]).default("indoor"),
      dayType: z.enum(["weekday", "holiday", "both"]).default("both"),
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
      category: z.enum(["indoor", "outdoor", "pt"]).optional(),
      dayType: z.enum(["weekday", "holiday", "both"]).optional(),
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

  reorder: publicProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.reorderWorkShifts(input.orderedIds);
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
      const today = getTodayTW();
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

  getPending: publicProcedure.query(async () => db.getPendingDevices()),

  register: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      deviceId: z.string(),
      deviceName: z.string().optional(),
      platform: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Check if this exact device is already registered
      const existing = await db.findDevice(input.employeeId, input.deviceId);
      if (existing) {
        // Migrate legacy NULL status to approved in DB
        if (!existing.status) {
          await db.updateDeviceStatus(existing.id, "approved");
        }
        return { success: true, id: existing.id, alreadyRegistered: true, status: "approved" };
      }

      // No single-device restriction: all new devices auto-approved
      const id = await db.registerDevice({ ...input, status: "approved" });
      return { success: true, id, alreadyRegistered: false, status: "approved" };
    }),

  review: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["approved", "rejected"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateDeviceStatus(input.id, input.status);
      return { success: true };
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
// Punch Correction Router
// ============================================================
const punchCorrectionRouter = router({
  create: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      date: z.string(),
      type: z.enum(["clock_in", "clock_out", "both"]),
      requestedClockIn: z.string().optional(),
      requestedClockOut: z.string().optional(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createPunchCorrection(input);
      return { success: true, id };
    }),

  getByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => db.getPunchCorrectionsByEmployee(input.employeeId)),

  getAll: publicProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }))
    .query(async ({ input }) => db.getAllPunchCorrections(input.status)),

  review: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["approved", "rejected"]),
      reviewedBy: z.number(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.reviewPunchCorrection(input.id, input.reviewedBy, input.status, input.reviewNote);
      return { success: true };
    }),
});

// ============================================================
// Push Notification Router
// ============================================================
const pushRouter = router({
  getVapidKey: publicProcedure.query(() => ({ publicKey: VAPID_PUBLIC_KEY })),

  subscribe: publicProcedure
    .input(z.object({
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
      userAgent: z.string().optional(),
      employeeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.savePushSubscription({ ...input, employeeId: input.employeeId ?? null });
      return { success: true };
    }),

  unsubscribe: publicProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ input }) => {
      await db.deletePushSubscription(input.endpoint);
      return { success: true };
    }),

  test: publicProcedure
    .mutation(async () => {
      await sendPushToAll({
        title: "好好上班 - 測試通知",
        body: "推播通知設定成功！您將收到打卡異常的即時通知。",
        icon: "/favicon.png",
      });
      return { success: true };
    }),
});

// ============================================================
// LINE OTP Router
// ============================================================
const lineRouter = router({
  // Check if employee has LINE bound
  status: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const employee = await db.getEmployeeById(input.employeeId);
      return { bound: !!employee?.lineUserId };
    }),

  // Send OTP to employee's LINE
  sendOtp: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .mutation(async ({ input }) => {
      const employee = await db.getEmployeeById(input.employeeId);
      if (!employee) throw new Error("找不到員工資料");
      if (!employee.lineUserId) throw new Error("尚未綁定 LINE 帳號，請先在 LINE 官方帳號輸入「綁定 帳號」完成綁定");
      const code = await db.createLineOtp(input.employeeId);
      const { sendLineMessage } = await import("./line-bot");
      await sendLineMessage(
        employee.lineUserId,
        `🔐 好好上班打卡驗證碼\n\n驗證碼：${code}\n\n此驗證碼將於 5 分鐘後失效，請勿分享給他人。`
      );
      return { success: true };
    }),

  // Verify OTP
  verifyOtp: publicProcedure
    .input(z.object({ employeeId: z.number(), code: z.string().length(6) }))
    .mutation(async ({ input }) => {
      const valid = await db.verifyLineOtp(input.employeeId, input.code);
      if (!valid) throw new Error("驗證碼錯誤或已過期，請重新發送");
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
  punchCorrection: punchCorrectionRouter,
  push: pushRouter,
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
