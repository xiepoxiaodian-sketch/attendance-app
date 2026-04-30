import { describe, it, expect } from "vitest";

// ── Replicate the core logic from attendance-ssr.ts ──────────────────────────

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d as string);
  if (isNaN(dt.getTime())) return "—";
  const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
  const h = String(tw.getUTCHours()).padStart(2, "0");
  const m = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d as string);
  if (isNaN(dt.getTime())) return "—";
  const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
  const y = tw.getUTCFullYear();
  const mo = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(tw.getUTCDate()).padStart(2, "0");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const wd = weekdays[tw.getUTCDay()];
  return `${y}-${mo}-${dy}（週${wd}）`;
}

function computeStatus(
  clockIn: Date | string | null,
  clockOut: Date | string | null,
  shift: { startTime: string; endTime: string } | undefined,
  storedStatus: string | null,
  lateThreshold: number
): string {
  if (!shift) return storedStatus || "normal";
  const toTWMinutes = (d: Date | string) => {
    const dt = d instanceof Date ? d : new Date(d as string);
    const tw = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
    return tw.getUTCHours() * 60 + tw.getUTCMinutes();
  };
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const shiftStart = sh * 60 + sm;
  const shiftEnd = eh * 60 + em;
  let status = "normal";
  if (clockIn) {
    const inMin = toTWMinutes(clockIn);
    if (inMin - shiftStart > lateThreshold) status = "late";
  }
  if (clockOut) {
    const outMin = toTWMinutes(clockOut);
    if (outMin < shiftEnd - 1) {
      status = "early_leave";
    } else if (status !== "late") {
      status = "normal";
    }
  }
  return status;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fmtDateTime (UTC+8 conversion)", () => {
  it("converts UTC time to Taiwan time correctly", () => {
    // 2026-04-05 03:00:00 UTC = 11:00 Taiwan
    const utcDate = new Date("2026-04-05T03:00:00.000Z");
    expect(fmtDateTime(utcDate)).toBe("11:00");
  });

  it("converts UTC time to Taiwan time: 06:00 UTC = 14:00 TW", () => {
    const utcDate = new Date("2026-04-05T06:00:00.000Z");
    expect(fmtDateTime(utcDate)).toBe("14:00");
  });

  it("returns — for null", () => {
    expect(fmtDateTime(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(fmtDateTime(undefined)).toBe("—");
  });

  it("handles string input", () => {
    expect(fmtDateTime("2026-04-05T03:00:00.000Z")).toBe("11:00");
  });
});

describe("fmtDate (Taiwan date format)", () => {
  it("formats date with weekday in Chinese", () => {
    // 2026-04-05 is a Sunday
    const result = fmtDate(new Date("2026-04-05T00:00:00.000Z"));
    expect(result).toContain("2026-04-05");
    expect(result).toContain("週");
  });
});

describe("computeStatus (late/early_leave/normal detection)", () => {
  const shift1030_1400 = { startTime: "10:30", endTime: "14:00" };
  const shift1100_1400 = { startTime: "11:00", endTime: "14:00" };
  const lateThreshold = 10; // 10 minutes

  // ── Late detection ──────────────────────────────────────────────────────

  it("marks as late when clock-in is more than 10 min after shift start", () => {
    // Shift 10:30, clock in at 11:00 = 30 min late
    const clockIn = new Date("2026-04-05T03:00:00.000Z"); // 11:00 TW
    const status = computeStatus(clockIn, null, shift1030_1400, null, lateThreshold);
    expect(status).toBe("late");
  });

  it("marks as normal when clock-in is within threshold (10 min)", () => {
    // Shift 11:00, clock in at 11:05 = 5 min late (within threshold)
    const clockIn = new Date("2026-04-05T03:05:00.000Z"); // 11:05 TW
    const status = computeStatus(clockIn, null, shift1100_1400, null, lateThreshold);
    expect(status).toBe("normal");
  });

  it("marks as late when clock-in is exactly at threshold + 1 min", () => {
    // Shift 11:00, clock in at 11:11 = 11 min late (over threshold of 10)
    const clockIn = new Date("2026-04-05T03:11:00.000Z"); // 11:11 TW
    const status = computeStatus(clockIn, null, shift1100_1400, null, lateThreshold);
    expect(status).toBe("late");
  });

  // ── Early leave detection ────────────────────────────────────────────────

  it("marks as early_leave when clock-out is before shift end", () => {
    // Shift ends 14:00, clock out at 13:30 = early leave
    const clockIn = new Date("2026-04-05T03:00:00.000Z"); // 11:00 TW
    const clockOut = new Date("2026-04-05T05:30:00.000Z"); // 13:30 TW
    const status = computeStatus(clockIn, clockOut, shift1100_1400, null, lateThreshold);
    expect(status).toBe("early_leave");
  });

  it("marks as normal when clock-out is at or after shift end", () => {
    // Shift ends 14:00, clock out at 14:05 = normal
    const clockIn = new Date("2026-04-05T03:00:00.000Z"); // 11:00 TW
    const clockOut = new Date("2026-04-05T06:05:00.000Z"); // 14:05 TW
    const status = computeStatus(clockIn, clockOut, shift1100_1400, null, lateThreshold);
    expect(status).toBe("normal");
  });

  it("marks as early_leave even if late (early_leave takes priority on clock-out)", () => {
    // Shift 11:00-14:00, clock in at 11:30 (late), clock out at 13:00 (early)
    const clockIn = new Date("2026-04-05T03:30:00.000Z"); // 11:30 TW
    const clockOut = new Date("2026-04-05T05:00:00.000Z"); // 13:00 TW
    const status = computeStatus(clockIn, clockOut, shift1100_1400, null, lateThreshold);
    expect(status).toBe("early_leave");
  });

  // ── 杜可凡 case: scheduled 10:30, clocked in 11:00 → should be late ──────

  it("杜可凡 case: shift 10:30, clock-in 11:00 → late (30 min > 10 min threshold)", () => {
    const clockIn = new Date("2026-04-05T03:00:00.000Z"); // 11:00 TW
    const status = computeStatus(clockIn, null, shift1030_1400, null, 10);
    expect(status).toBe("late");
  });

  // ── No shift case ────────────────────────────────────────────────────────

  it("falls back to stored status when no shift is found", () => {
    const clockIn = new Date("2026-04-05T03:00:00.000Z");
    const status = computeStatus(clockIn, null, undefined, "late", lateThreshold);
    expect(status).toBe("late");
  });

  it("returns normal when no shift and no stored status", () => {
    const clockIn = new Date("2026-04-05T03:00:00.000Z");
    const status = computeStatus(clockIn, null, undefined, null, lateThreshold);
    expect(status).toBe("normal");
  });

  // ── Clock-out exactly at end time (boundary) ─────────────────────────────

  it("normal when clock-out is exactly at shift end time", () => {
    // Shift ends 14:00, clock out at 14:00 → shiftEnd - 1 = 839, outMin = 840 >= 839 → normal
    const clockIn = new Date("2026-04-05T03:00:00.000Z"); // 11:00 TW
    const clockOut = new Date("2026-04-05T06:00:00.000Z"); // 14:00 TW
    const status = computeStatus(clockIn, clockOut, shift1100_1400, null, lateThreshold);
    expect(status).toBe("normal");
  });
});

describe("grouping logic (same employee same day)", () => {
  it("correctly extracts Taiwan date from UTC date object", () => {
    // A record with date 2026-04-05T00:00:00.000Z should map to 2026-04-05 in TW
    const d = new Date("2026-04-05T00:00:00.000Z");
    const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const dateKey = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
    expect(dateKey).toBe("2026-04-05");
  });

  it("two records with same employeeId and same date produce same groupKey", () => {
    const employeeId = 5;
    const date1 = new Date("2026-04-05T00:00:00.000Z");
    const date2 = new Date("2026-04-05T00:00:00.000Z");
    const getDateKey = (d: Date) => {
      const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, "0")}-${String(tw.getUTCDate()).padStart(2, "0")}`;
    };
    const key1 = `${employeeId}_${getDateKey(date1)}`;
    const key2 = `${employeeId}_${getDateKey(date2)}`;
    expect(key1).toBe(key2);
  });
});
