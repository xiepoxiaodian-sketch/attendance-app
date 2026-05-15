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
      // Also compute yesterday in TW timezone to handle cross-midnight clock-out
      // (e.g., employee clocked in at 16:48 on 5/9, clocking out at 00:21 on 5/10)
      const yesterdayDate = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yesterday = yesterdayDate.toISOString().split("T")[0];
      const now = new Date();
      const records = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      // Also fetch yesterday's records to handle cross-midnight shifts
      const yesterdayRecords = await db.getAttendanceByEmployeeAndDate(input.employeeId, yesterday);
      let record;
      if (input.attendanceId) {
        record = records.find(r => r.id === input.attendanceId)
          ?? yesterdayRecords.find(r => r.id === input.attendanceId);
      } else {
        const shiftLabel = input.shiftLabel || "班次1";
        // First try today's records, then fall back to yesterday's (cross-midnight case)
        record = records.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime)
          ?? yesterdayRecords.find(r => r.shiftLabel === shiftLabel && r.clockInTime && !r.clockOutTime);
      }
      if (!record) {
        // Employee chose to clock out without a clock-in record (forgot to clock in)
        // Create a new attendance record with no clockInTime, mark as absent
        const shiftLabel = input.shiftLabel || "班次1";
        const newId = await db.createAttendance({
          employeeId: input.employeeId,
          date: new Date(today) as unknown as Date,
          clockInTime: null as any,
          clockOutTime: now,
          shiftLabel,
          status: "absent",
          clockOutLat: input.lat ?? null,
          clockOutLng: input.lng ?? null,
          clockOutPhoto: input.photoBase64 ? (input.photoBase64.length > 600000 ? null : input.photoBase64) : null,
        } as any);
        return { success: true, status: "absent", note: "已補打下班卡（無上班記錄，標記為缺勤）" };
      }

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
      // For cross-midnight shifts: the attendance record's date tells us which day the shift belongs to
      // We need to fetch the schedule for that date, not necessarily "today"
      let recordDateStr = today;
      if (record.date) {
        const rd = record.date instanceof Date ? record.date : new Date(record.date as any);
        if (!isNaN(rd.getTime())) {
          const y = rd.getFullYear();
          const mo = String(rd.getMonth() + 1).padStart(2, "0");
          const dy = String(rd.getDate()).padStart(2, "0");
          recordDateStr = `${y}-${mo}-${dy}`;
        }
      }
      const schedule = await db.getScheduleByEmployeeAndDate(input.employeeId, recordDateStr);
      if (schedule && schedule.shifts) {
        const shifts = schedule.shifts as Array<{ startTime: string; endTime: string; label: string }>;
        // Match by shiftLabel from the attendance record for accurate multi-shift handling
        const currentShift = shifts.find(s => s.label === record.shiftLabel) ||
          shifts.find(s => {
            // Fallback: find shift whose end time is closest to now (accounting for overnight)
            const [eh, em] = s.endTime.split(":").map(Number);
            const shiftEndMin = eh * 60 + em;
            // Handle overnight: if shift end is past midnight (e.g. 01:00 = 60), add 1440 for comparison
            const adjustedEnd = shiftEndMin < 360 ? shiftEndMin + 1440 : shiftEndMin; // <6am treated as next day
            const adjustedNow = nowTWMinutes_out < 360 ? nowTWMinutes_out + 1440 : nowTWMinutes_out;
            return Math.abs(adjustedEnd - adjustedNow) < 120; // within 2 hours
          }) || shifts[0];
        if (currentShift) {
          const [h, m] = currentShift.endTime.split(":").map(Number);
          const shiftEndMinutes = h * 60 + m;
          const wasLate = record.status === "late" || record.status === "late_and_early";
          // Handle overnight shifts: if shift end is before 6am, treat it as next-day time
          // e.g. shift ends at 01:00 (60 min), clock-out at 00:50 (50 min) → both are "next day"
          const isOvernightShift = shiftEndMinutes < 360; // shift ends before 6am
          let effectiveNow = nowTWMinutes_out;
          let effectiveEnd = shiftEndMinutes;
          if (isOvernightShift) {
            // Both now and shift end are in the early morning (next day context)
            // No adjustment needed — compare directly
          } else if (nowTWMinutes_out < 360) {
            // Clock-out is early morning but shift end is not → overnight case
            // Treat now as nowTWMinutes_out + 1440 to compare correctly
            effectiveNow = nowTWMinutes_out + 1440;
          }
          // Early leave: clocked out more than 1 minute before shift end
          if (effectiveNow < effectiveEnd - 1) {
            // If already late, mark as both late and early leave
            status = wasLate ? "late_and_early" : "early_leave";
          } else {
            // Clocked out on time: preserve late status if applicable
            status = wasLate ? "late" : "normal";
          }
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
      const todayRecords = await db.getAttendanceByEmployeeAndDate(input.employeeId, today);
      // Also include yesterday's records that are still open (cross-midnight shifts)
      // so the employee can see their pending clock-out on the home screen
      const yesterdayDate = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yesterday = yesterdayDate.toISOString().split("T")[0];
      const yesterdayRecords = await db.getAttendanceByEmployeeAndDate(input.employeeId, yesterday);
      const openYesterdayRecords = yesterdayRecords.filter(r => r.clockInTime && !r.clockOutTime);
      return [...openYesterdayRecords, ...(todayRecords ?? [])];
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
        let isLate = false;
        let isEarlyLeave = false;
        if (clockIn) {
          const inMin = toTWMinutes(clockIn instanceof Date ? clockIn : new Date(clockIn));
          if (inMin - shiftStart > lateThreshold) isLate = true;
        }
        if (clockOut) {
          const outMin = toTWMinutes(clockOut instanceof Date ? clockOut : new Date(clockOut));
          // Handle overnight shifts: if shift ends before 6am (e.g. 01:00), it's a cross-midnight shift
          // If clock-out is in early morning (<6am) but shift end is in daytime, treat clock-out as next-day
          const isOvernightShift = shiftEnd < 360; // shift ends before 6am
          let effectiveOut = outMin;
          let effectiveEnd = shiftEnd;
          if (!isOvernightShift && outMin < 360) {
            // Clock-out is early morning but shift end is daytime -> overnight case
            // Add 1440 to make clock-out comparable (next day context)
            effectiveOut = outMin + 1440;
          }
          if (effectiveOut < effectiveEnd - 1) isEarlyLeave = true;
        }
        if (isLate && isEarlyLeave) return "late_and_early";
        if (isLate) return "late";
        if (isEarlyLeave) return "early_leave";
        return "normal";
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

  // 管理員手動新增打卡紀錄
  adminInsert: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      date: z.string(), // YYYY-MM-DD
      clockInTime: z.string(),  // ISO string (UTC)
      clockOutTime: z.string().optional().nullable(),
      shiftLabel: z.string().optional(),
      status: z.enum(["normal", "late", "early_leave", "absent", "late_and_early"]).optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const insertData: any = {
        employeeId: input.employeeId,
        date: new Date(input.date) as unknown as Date,
        clockInTime: new Date(input.clockInTime),
        clockOutTime: input.clockOutTime ? new Date(input.clockOutTime) : null,
        shiftLabel: input.shiftLabel ?? null,
        status: input.status ?? "normal",
        note: input.note ?? null,
      };
      const newId = await db.createAttendance(insertData);
      return { success: true, id: newId };
    }),

  adminUpdate: publicProcedure
    .input(z.object({
      id: z.number(),
      clockInTime: z.string().nullable().optional(),
      clockOutTime: z.string().nullable().optional(),
      note: z.string().optional(),
      status: z.enum(["normal", "late", "early_leave", "absent"]).optional(),
      shiftLabel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, clockInTime, clockOutTime, note, status, shiftLabel } = input;
      const updateData: Record<string, any> = {};
      if (clockInTime !== undefined) updateData.clockInTime = clockInTime ? new Date(clockInTime) : null;
      if (clockOutTime !== undefined) updateData.clockOutTime = clockOutTime ? new Date(clockOutTime) : null;
      if (note !== undefined) updateData.note = note;
      if (shiftLabel !== undefined) updateData.shiftLabel = shiftLabel;

      // 如果更換了班次，且管理員沒有手動指定 status，則根據新班次規定時間重新計算出勤狀態
      if (status !== undefined) {
        // 管理員手動指定狀態，直接使用
        updateData.status = status;
      } else if (shiftLabel !== undefined) {
        // 更換班次，自動重新計算狀態
        try {
          // 取得目前打卡紀錄
          const records = await db.getAllAttendance();
          const record = records.find((r: any) => r.id === id);
          if (record) {
            const actualClockIn = clockInTime !== undefined
              ? (clockInTime ? new Date(clockInTime) : null)
              : record.clockInTime;
            const actualClockOut = clockOutTime !== undefined
              ? (clockOutTime ? new Date(clockOutTime) : null)
              : record.clockOutTime;

            if (actualClockIn) {
              // 查詢新班次的規定時間
              const allShifts = await db.getAllWorkShifts();
              const matchedShift = allShifts.find((s: any) => s.name === shiftLabel);
              if (matchedShift) {
                const lateThreshold = parseInt(await db.getSetting("late_threshold_minutes") || "10");
                const [sh, sm] = matchedShift.startTime.split(":").map(Number);
                const [eh, em] = matchedShift.endTime.split(":").map(Number);
                const shiftStartMin = sh * 60 + sm;
                const shiftEndMin = eh * 60 + em;

                // 實際上班時間轉為台灣時間的分鐘數
                const inMin = actualClockIn.getUTCHours() * 60 + actualClockIn.getUTCMinutes() + 8 * 60;
                const normalizedIn = inMin % (24 * 60);

                let isLate2 = normalizedIn - shiftStartMin > lateThreshold;
                let isEarlyLeave2 = false;
                if (actualClockOut) {
                  const outMin = actualClockOut.getUTCHours() * 60 + actualClockOut.getUTCMinutes() + 8 * 60;
                  const normalizedOut = outMin % (24 * 60);
                  // Handle overnight: if shift ends before 6am it's overnight; if clock-out is early morning but shift ends in daytime, add 1440
                  const isOvernightShift2 = shiftEndMin < 360;
                  let effectiveOut2 = normalizedOut;
                  if (!isOvernightShift2 && normalizedOut < 360) {
                    effectiveOut2 = normalizedOut + 1440;
                  }
                  if (effectiveOut2 < shiftEndMin - 1) isEarlyLeave2 = true;
                }
                let newStatus: "normal" | "late" | "early_leave" | "absent" | "late_and_early" = "normal";
                if (isLate2 && isEarlyLeave2) newStatus = "late_and_early";
                else if (isLate2) newStatus = "late";
                else if (isEarlyLeave2) newStatus = "early_leave";
                updateData.status = newStatus;
              }
            }
          }
        } catch (e) {
          // 計算失敗時保持原狀態，不影響儲存
        }
      }

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

  // 薪資計算：取得指定月份各員工的出勤詳細（含打卡明細、上班時數、遅到早退、休假天數、請假天數）
  getMonthlySalary: publicProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(), // 1-12
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const { year, month, employeeId } = input;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // 取得所有員工列表（或單一員工）
      const allEmployees = await db.getAllEmployees();
      const targetEmployees = employeeId
        ? allEmployees.filter((e: any) => e.id === employeeId)
        : allEmployees.filter((e: any) => e.isActive && e.role === "employee");

      // 取得指定日期範圍的所有打卡記錄
      const records = await db.getAllAttendance(startDate, endDate, employeeId);

      // 取得所有排班（用於判斷休假天數）
      const allSchedules = await db.getAllSchedulesByDateRange(startDate, endDate);

      // 取得已核准請假
      const allLeaves = await db.getAllLeaveRequests("approved");
      const monthLeaves = allLeaves.filter((l: any) => {
        const lStart = new Date(l.startDate as string);
        const lEnd = new Date(l.endDate as string);
        const mStart = new Date(startDate);
        const mEnd = new Date(endDate);
        return lStart <= mEnd && lEnd >= mStart;
      });

      // 取得遲到閾値設定
      const lateThreshold = parseInt(await db.getSetting("late_threshold_minutes") || "10");

      // 建立排班查找表
      const scheduleMap = new Map<string, Array<{ startTime: string; endTime: string; label: string }>>();
      for (const s of allSchedules) {
        const rawDate = s.date instanceof Date ? s.date : new Date(s.date as any);
        const y = rawDate.getFullYear();
        const mo = String(rawDate.getMonth() + 1).padStart(2, "0");
        const dy = String(rawDate.getDate()).padStart(2, "0");
        const dateKey = `${y}-${mo}-${dy}`;
        const sKey = `${s.employeeId}_${dateKey}`;
        if (s.shifts && (s.shifts as any[]).length > 0) {
          scheduleMap.set(sKey, s.shifts as any[]);
        }
      }

      // 計算出勤狀態的 helper
      const toTWMinutes = (d: Date) => {
        const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
        return tw.getUTCHours() * 60 + tw.getUTCMinutes();
      };
      function computeStatus(
        clockIn: Date | null,
        clockOut: Date | null,
        shift: { startTime: string; endTime: string } | undefined,
        storedStatus: string | null
      ): string {
        if (!shift) return storedStatus || "normal";
        const [sh, sm] = shift.startTime.split(":").map(Number);
        const [eh, em] = shift.endTime.split(":").map(Number);
        const shiftStart = sh * 60 + sm;
        const shiftEnd = eh * 60 + em;
        let isLate = false;
        let isEarlyLeave = false;
        if (clockIn) {
          const inMin = toTWMinutes(clockIn instanceof Date ? clockIn : new Date(clockIn));
          if (inMin - shiftStart > lateThreshold) isLate = true;
        }
        if (clockOut) {
          const outMin = toTWMinutes(clockOut instanceof Date ? clockOut : new Date(clockOut));
          // Handle overnight shifts: if shift ends before 6am, it's a cross-midnight shift
          // If clock-out is early morning but shift end is daytime, treat clock-out as next-day
          const isOvernightShift = shiftEnd < 360;
          let effectiveOut = outMin;
          if (!isOvernightShift && outMin < 360) {
            effectiveOut = outMin + 1440; // next-day context
          }
          if (effectiveOut < shiftEnd - 1) isEarlyLeave = true;
        }
        if (isLate && isEarlyLeave) return "late_and_early";
        if (isLate) return "late";
        if (isEarlyLeave) return "early_leave";
        return "normal";
      }

      // 對每位員工建立詳細資料
      const result = targetEmployees.map((emp: any) => {
        const empRecords = records.filter((r: any) => r.employeeId === emp.id);

        // 按日期分組打卡記錄
        const dailyMap = new Map<string, Array<{
          id: number;
          shiftLabel: string;
          clockInTime: any;
          clockOutTime: any;
          status: string;
          workMinutes: number;
        }>>();

        for (const r of empRecords) {
          let dateKey = "";
          if (r.date) {
            const d = r.date instanceof Date ? r.date : new Date(r.date as any);
            if (!isNaN(d.getTime())) {
              dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            } else {
              dateKey = String(r.date).split("T")[0].split(" ")[0];
            }
          }
          const groupKey = `${emp.id}_${dateKey}`;
          const shiftsForDay = scheduleMap.get(groupKey);
          const shiftLabel = r.shiftLabel || "一般班";
          const matchedShift = shiftsForDay?.find((s: any) => s.label === shiftLabel);
          const dynamicStatus = computeStatus(
            r.clockInTime ? (r.clockInTime instanceof Date ? r.clockInTime : new Date(r.clockInTime as any)) : null,
            r.clockOutTime ? (r.clockOutTime instanceof Date ? r.clockOutTime : new Date(r.clockOutTime as any)) : null,
            matchedShift,
            r.status ?? null
          );
          // 計算實際工作分鐘數
          let workMinutes = 0;
          if (r.clockInTime && r.clockOutTime) {
            const inTime = r.clockInTime instanceof Date ? r.clockInTime : new Date(r.clockInTime as any);
            const outTime = r.clockOutTime instanceof Date ? r.clockOutTime : new Date(r.clockOutTime as any);
            workMinutes = Math.max(0, Math.round((outTime.getTime() - inTime.getTime()) / 60000));
          }
          if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, []);
          dailyMap.get(dateKey)!.push({
            id: r.id,
            shiftLabel,
            clockInTime: r.clockInTime,
            clockOutTime: r.clockOutTime,
            status: dynamicStatus,
            workMinutes,
          });
        }

        // 建立每日明細列表（按日期降序）
        const dailyRecords = Array.from(dailyMap.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([dateKey, shifts]) => ({
            dateKey,
            shifts,
            totalWorkMinutes: shifts.reduce((sum, s) => sum + s.workMinutes, 0),
            hasLate: shifts.some(s => s.status === "late" || s.status === "late_and_early"),
            hasEarlyLeave: shifts.some(s => s.status === "early_leave" || s.status === "late_and_early"),
            hasAbsent: shifts.some(s => !s.clockInTime),
          }));

        // 統計數據
        const totalWorkMinutes = dailyRecords.reduce((sum, d) => sum + d.totalWorkMinutes, 0);
        const presentDays = dailyRecords.filter(d => d.shifts.some(s => s.clockInTime)).length;
        const lateDays = dailyRecords.filter(d => d.hasLate).length;
        const earlyLeaveDays = dailyRecords.filter(d => d.hasEarlyLeave).length;
        const absentDays = dailyRecords.filter(d => d.hasAbsent).length;

        // 休假天數：該員工在指定月份有排班且排班中有設定 leaveType 的天數
        const empSchedules = allSchedules.filter((s: any) => s.employeeId === emp.id);
        const scheduledLeaveDays = empSchedules.filter((s: any) => s.leaveType && s.leaveMode === "allDay").length;

        // 請假天數：從 leaveRequests 計算（已核准）
        const empLeaves = monthLeaves.filter((l: any) => l.employeeId === emp.id);
        const leaveDays = empLeaves.reduce((sum: number, l: any) => {
          const lStart = new Date(l.startDate as string);
          const lEnd = new Date(l.endDate as string);
          const mStart = new Date(startDate);
          const mEnd = new Date(endDate);
          const effectiveStart = lStart < mStart ? mStart : lStart;
          const effectiveEnd = lEnd > mEnd ? mEnd : lEnd;
          const days = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return sum + Math.max(0, days);
        }, 0);

        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          employeeUsername: emp.username,
          jobTitle: emp.jobTitle ?? emp.role,
          employeeType: emp.employeeType,
          totalWorkMinutes,
          totalWorkHours: parseFloat((totalWorkMinutes / 60).toFixed(1)),
          presentDays,
          lateDays,
          earlyLeaveDays,
          absentDays,
          scheduledLeaveDays,
          leaveDays,
          dailyRecords,
        };
      });

      return result;
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
      tag: z.enum(["indoor", "outdoor", "supervisor", "pt"]).optional(),
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
      tag: z.enum(["indoor", "outdoor", "supervisor", "pt"]).nullable().optional(),
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
      const todaySchedule = await db.getScheduleByEmployeeAndDate(input.employeeId, today);
      if (todaySchedule) return todaySchedule;
      // Cross-midnight fallback: if no today schedule, check if employee has an open
      // clock-in from yesterday (e.g., late-night shift that hasn't been clocked out yet)
      const yesterdayDate = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
      const yesterday = yesterdayDate.toISOString().split("T")[0];
      const openYesterdayRecords = await db.getAttendanceByEmployeeAndDate(input.employeeId, yesterday);
      const hasOpenShift = openYesterdayRecords.some(r => r.clockInTime && !r.clockOutTime);
      if (hasOpenShift) {
        // Return yesterday's schedule so the home screen shows the correct shift card
        const yesterdaySchedule = await db.getScheduleByEmployeeAndDate(input.employeeId, yesterday);
        return yesterdaySchedule ?? null;
      }
      return null;
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
  batchUpsert: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      entries: z.array(z.object({
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
      })),
    }))
    .mutation(async ({ input }) => {
      for (const entry of input.entries) {
        await db.upsertSchedule(input.employeeId, entry.date, entry.shifts, {
          leaveType: entry.leaveType ?? null,
          leaveMode: entry.leaveMode ?? null,
          leaveStart: entry.leaveStart ?? null,
          leaveEnd: entry.leaveEnd ?? null,
          leaveDuration: entry.leaveDuration ?? null,
        });
      }
      return { success: true };
    }),
  getEmployeeMonth: publicProcedure
    .input(z.object({ employeeId: z.number(), year: z.number(), month: z.number() }))
    .query(async ({ input }) => {
      const startDate = `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(input.year, input.month + 1, 0).getDate();
      const endDate = `${input.year}-${String(input.month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const all = await db.getAllSchedulesByDateRange(startDate, endDate);
      return (all as any[]).filter((s: any) => s.employeeId === input.employeeId);
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
      screenshotBase64: z.string().optional(),
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
// Feedback Router
// ============================================================
const feedbackRouter = router({
  create: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      type: z.enum(["bug", "suggestion", "other"]),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      screenshotBase64: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createFeedback(input);
      return { success: true, id };
    }),

  getAll: publicProcedure
    .query(async () => {
      return db.getAllFeedbacks();
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getFeedbackById(input.id);
    }),

  updateStatus: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "reviewing", "resolved", "closed"]),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.updateFeedbackStatus(input.id, input.status, input.adminNote);
      return { success: true };
    }),

  getByEmployee: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      return db.getFeedbacksByEmployee(input.employeeId);
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
  feedback: feedbackRouter,
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
