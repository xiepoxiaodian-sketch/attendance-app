/**
 * Cron Jobs for 好好上班
 *
 * Runs every minute to check:
 * 1. Clock-in reminder: 5 minutes before shift start → push to employee
 * 2. Missing clock-in alert: N minutes after shift start, employee hasn't clocked in → push to admins
 */
import webpush from "web-push";
import * as db from "./db";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:admin@goodwork.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ============================================================
// Helpers
// ============================================================

/** Get current time as HH:MM string in local timezone */
function nowHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Get today's date as YYYY-MM-DD string */
function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Convert HH:MM to total minutes */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Send push to a specific employee's subscriptions */
async function sendPushToEmployee(employeeId: number, payload: { title: string; body: string }) {
  const subs = await db.getPushSubscriptionsByEmployee(employeeId);
  const deadEndpoints: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, icon: "/favicon.png" })
      );
    } catch {
      deadEndpoints.push(sub.endpoint);
    }
  }
  for (const ep of deadEndpoints) await db.deletePushSubscription(ep);
}

/** Send push to all admin subscriptions (employeeId IS NULL) */
async function sendPushToAdmins(payload: { title: string; body: string }) {
  const subs = await db.getAdminPushSubscriptions();
  const deadEndpoints: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, icon: "/favicon.png" })
      );
    } catch {
      deadEndpoints.push(sub.endpoint);
    }
  }
  for (const ep of deadEndpoints) await db.deletePushSubscription(ep);
}

// ============================================================
// Main cron tick (called every minute)
// ============================================================

// Track already-sent notifications to avoid duplicates within the same day
// Key: `${date}-${employeeId}-${shiftStart}-${type}`
const sentToday = new Set<string>();

// Reset sentToday at midnight
let lastResetDate = todayStr();

async function cronTick() {
  try {
    const today = todayStr();

    // Reset sent tracker on new day
    if (today !== lastResetDate) {
      sentToday.clear();
      lastResetDate = today;
    }

    const nowMins = toMinutes(nowHHMM());

    // Get settings
    const [
      missingAlertEnabled,
      missingThresholdRaw,
      reminderEnabled,
    ] = await Promise.all([
      db.getSetting("push_notify_missing"),
      db.getSetting("push_missing_threshold_minutes"),
      db.getSetting("push_notify_reminder"),
    ]);

    const missingThreshold = parseInt(missingThresholdRaw || "15", 10);

    // Get today's schedules
    const todaySchedules = await db.getAllSchedulesByDateRange(today, today);
    if (!todaySchedules.length) return;

    // Get all employees for name lookup
    const allEmployees = await db.getAllEmployees();
    const empMap = new Map(allEmployees.map((e) => [e.id, e]));

    for (const sched of todaySchedules) {
      const emp = empMap.get(sched.employeeId);
      if (!emp || !emp.isActive) continue;

      // Skip admin accounts
      if (emp.role === "admin") continue;

      const shifts = sched.shifts as Array<{ startTime: string; endTime: string; label: string }>;
      if (!shifts || !shifts.length) continue;

      // Get today's attendance for this employee
      const attRecords = await db.getAttendanceByEmployeeAndDate(sched.employeeId, today);
      const hasClockedIn = attRecords.some(r => r.clockInTime != null);

      for (const shift of shifts) {
        const shiftStartMins = toMinutes(shift.startTime);

        // ── 1. Clock-in reminder: 5 min before shift start ──────────────────
        if (reminderEnabled === "true") {
          const reminderKey = `${today}-${sched.employeeId}-${shift.startTime}-reminder`;
          const reminderTarget = shiftStartMins - 5;
          if (nowMins === reminderTarget && !sentToday.has(reminderKey)) {
            sentToday.add(reminderKey);
            await sendPushToEmployee(sched.employeeId, {
              title: "⏰ 打卡提醒",
              body: `${emp.fullName}，您的班次「${shift.label || shift.startTime}」將在 5 分鐘後開始，請記得打卡！`,
            });
          }
        }

        // ── 2. Missing clock-in alert: N min after shift start ───────────────
        if (missingAlertEnabled === "true" && !hasClockedIn) {
          const alertKey = `${today}-${sched.employeeId}-${shift.startTime}-missing`;
          const alertTarget = shiftStartMins + missingThreshold;
          if (nowMins === alertTarget && !sentToday.has(alertKey)) {
            sentToday.add(alertKey);
            await sendPushToAdmins({
              title: "⚠️ 未打卡提醒",
              body: `${emp.fullName} 的班次「${shift.label || shift.startTime}」已超過 ${missingThreshold} 分鐘，尚未打卡上班`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[cron] tick error:", err);
  }
}

// ============================================================
// Photo cleanup (runs once daily at midnight)
// ============================================================
async function photoCleanupTick() {
  try {
    const cleared = await db.clearOldAttendancePhotos(7);
    if (cleared > 0) {
      console.log(`[cron] Photo cleanup: cleared photos from ${cleared} attendance records older than 7 days`);
    }
  } catch (err) {
    console.error("[cron] Photo cleanup error:", err);
  }
}

// ============================================================
// Start cron (called once at server startup)
// ============================================================
export function startCronJobs() {
  console.log("[cron] Starting attendance cron jobs (every 60s)");
  // Run notification tick every 60 seconds
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    cronTick();
    setInterval(cronTick, 60 * 1000);
  } else {
    console.log("[cron] VAPID keys not set, skipping push notification jobs");
  }

  // Run photo cleanup once at startup, then every 24 hours
  photoCleanupTick();
  setInterval(photoCleanupTick, 24 * 60 * 60 * 1000);
  console.log("[cron] Photo cleanup scheduled (every 24h, retains 7 days)");
}
