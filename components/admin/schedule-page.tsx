import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, FlatList, TextInput, Switch, RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { TimePickerWheel } from "@/components/time-picker-wheel";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";
import { useDragSort } from "@/hooks/use-drag-sort";

// ─── helpers ────────────────────────────────────────────────────────────────
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getWeekDates(offset: number) {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + (dow === 0 ? -6 : 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function calcDuration(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? parseFloat((diff / 60).toFixed(1)) : 0;
}

// ─── constants ──────────────────────────────────────────────────────────────
type LeaveTypeValue = "annual" | "sick" | "personal" | "marriage" | "bereavement" | "official" | "other";
const LEAVE_TYPES: { value: LeaveTypeValue; label: string; color: string; bg: string }[] = [
  { value: "annual",   label: "特休", color: "#2563EB", bg: "#EFF6FF" },
  { value: "sick",     label: "病假", color: "#DC2626", bg: "#FEF2F2" },
  { value: "personal", label: "事假", color: "#D97706", bg: "#FFFBEB" },
  { value: "marriage", label: "婚假", color: "#7C3AED", bg: "#F5F3FF" },
  { value: "bereavement",  label: "喪假", color: "#475569", bg: "#F8FAFC" },
  { value: "official", label: "公假", color: "#0891B2", bg: "#ECFEFF" },
  { value: "other",    label: "休假", color: "#64748B", bg: "#F1F5F9" },
];
type ShiftEntry = { startTime: string; endTime: string; label: string };

// ─── Tab bar ────────────────────────────────────────────────────────────────
const TABS = ["週排班", "月總覽", "工作時段"] as const;
type TabType = typeof TABS[number];

// ═══════════════════════════════════════════════════════════════════════════
// WEEK TAB
// ═══════════════════════════════════════════════════════════════════════════
function WeekTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [leave, setLeave] = useState<{ enabled: boolean; type: LeaveTypeValue; mode: "allDay" | "partial"; start: string; end: string }>({
    enabled: false, type: "annual", mode: "allDay", start: "09:00", end: "18:00",
  });
  const [alertMsg, setAlertMsg] = useState<{ title: string; message: string } | null>(null);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState(false);
  const [staffingPopup, setStaffingPopup] = useState<{ dateStr: string; slot: number; names: string[] } | null>(null);
  const [showStaffingView, setShowStaffingView] = useState(true);

  const handlePrint = () => {
    if (Platform.OS !== "web") return;
    const dateRange = `${weekDates[0].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} – ${weekDates[6].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}`;
    const year = weekDates[0].getFullYear();
    const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
    const LEAVE_LABEL: Record<string, string> = {
      annual: "特休", sick: "病假", personal: "事假",
      marriage: "婚假", bereavement: "喪假", official: "公假", other: "假",
    };
    const colHeaders = weekDates.map(d => {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      return `<th style="background:${isWeekend ? "#F1F5F9" : "#1E40AF"};color:${isWeekend ? "#64748B" : "white"};padding:8px 4px;font-size:12px;text-align:center;border:1px solid #CBD5E1;">
        <div style="font-weight:700">${WEEKDAY_LABELS[d.getDay()]}</div>
        <div style="font-size:11px;margin-top:2px">${d.getMonth() + 1}/${d.getDate()}</div>
      </th>`;
    }).join("");
    const rows = activeEmployees.map(emp => {
      const cells = weekDates.map(d => {
        const dateStr = toDateStr(d);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const schedule = scheduleMap[emp.id]?.[dateStr];
        const hasSchedule = !!schedule?.shifts?.length;
        let cellContent = `<span style="color:#CBD5E1">—</span>`;
        let cellBg = isWeekend ? "#F8FAFC" : "white";
        if (schedule?.leaveType && schedule.leaveMode === "allDay") {
          const lbl = LEAVE_LABEL[schedule.leaveType] ?? "假";
          cellBg = "#FEF2F2";
          cellContent = `<span style="color:#DC2626;font-weight:700;font-size:12px">${lbl}</span>`;
        } else if (hasSchedule) {
          cellBg = "#EFF6FF";
          cellContent = schedule.shifts.map((sh: any) =>
            `<div style="font-size:11px;color:#1D4ED8;font-weight:600;line-height:1.4">${sh.startTime}<br/><span style="color:#93C5FD;font-size:10px">↓</span><br/>${sh.endTime}</div>`
          ).join(`<div style="border-top:1px dashed #BFDBFE;margin:2px 0"></div>`);
        }
        return `<td style="background:${cellBg};padding:6px 4px;text-align:center;border:1px solid #E2E8F0;min-width:60px;vertical-align:middle">${cellContent}</td>`;
      }).join("");
      return `<tr>
        <td style="padding:6px 10px;border:1px solid #E2E8F0;white-space:nowrap;background:#F8FAFC;font-size:12px;font-weight:600;color:#1E293B">${emp.fullName}</td>
        ${cells}
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>排班表 ${year} ${dateRange}</title>
<style>
  body { font-family: -apple-system, "Microsoft JhengHei", sans-serif; margin: 0; padding: 16px; }
  h1 { font-size: 18px; color: #1E293B; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #64748B; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  @media print {
    body { padding: 8px; }
    button { display: none !important; }
    @page { size: landscape; margin: 10mm; }
  }
</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <div>
    <h1>📅 週排班表</h1>
    <div class="meta">${year} 年 ${dateRange} &nbsp;·&nbsp; 共 ${activeEmployees.length} 位員工 &nbsp;·&nbsp; 列印時間：${new Date().toLocaleString("zh-TW")}</div>
  </div>
  <button onclick="window.print()" style="background:#1E40AF;color:white;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;font-weight:600">🖨 列印</button>
</div>
<table>
  <thead><tr><th style="background:#1E40AF;color:white;padding:8px 10px;font-size:12px;text-align:left;border:1px solid #CBD5E1;min-width:70px">員工</th>${colHeaders}</tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const weekDates = getWeekDates(weekOffset);
  const startDate = toDateStr(weekDates[0]);
  const endDate = toDateStr(weekDates[6]);
  const todayStr = toDateStr(new Date());

  const { data: employees } = trpc.employees.list.useQuery();
  const { data: workShifts } = trpc.workShifts.list.useQuery();
  const { data: weekSchedules, refetch: refetchSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });
  const { data: weekSettingsData } = trpc.settings.getAll.useQuery();

  // 解析分組設定
  const shiftGroups = useMemo(() => {
    if (!weekSettingsData?.shift_groups) return [] as Array<{ id: string; name: string; shiftIds: number[] }>;
    try {
      const parsed = JSON.parse(weekSettingsData.shift_groups);
      return Array.isArray(parsed) ? parsed as Array<{ id: string; name: string; shiftIds: number[] }> : [];
    } catch { return []; }
  }, [weekSettingsData]);

  const activeEmployees = (employees ?? []).filter(e => e.isActive && e.role === "employee");

  const scheduleMap = useMemo(() => {
    const map: Record<number, Record<string, {
      id: number; shifts: ShiftEntry[];
      leaveType?: string | null; leaveMode?: string | null;
      leaveStart?: string | null; leaveEnd?: string | null; leaveDuration?: string | null;
    }>> = {};
    for (const s of (weekSchedules ?? [])) {
      const empId = s.employeeId;
      const rawDate = s.date as unknown as string | Date;
      const dateKey = typeof rawDate === "string" ? rawDate.split("T")[0] : toDateStr(rawDate);
      if (!map[empId]) map[empId] = {};
      map[empId][dateKey] = {
        id: s.id, shifts: s.shifts as ShiftEntry[],
        leaveType: s.leaveType, leaveMode: s.leaveMode,
        leaveStart: s.leaveStart, leaveEnd: s.leaveEnd, leaveDuration: s.leaveDuration,
      };
    }
    return map;
  }, [weekSchedules]);

  const utils = trpc.useUtils();

  const invalidateSchedules = useCallback(() => {
    // Invalidate all schedule queries so MonthTab re-fetches on next render
    utils.schedules.getWeekAll.invalidate();
  }, [utils]);

  const upsertMutation = trpc.schedules.upsert.useMutation({
    onSuccess: () => {
      setShowModal(false);
      refetchSchedules();
      invalidateSchedules();
      setAlertMsg({ title: "成功", message: "排班已儲存" });
    },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });
  const deleteMutation = trpc.schedules.delete.useMutation({
    onSuccess: () => {
      setShowModal(false);
      refetchSchedules();
      invalidateSchedules();
    },
    onError: (err) => setAlertMsg({ title: "錯誤", message: err.message }),
  });

  const handleOpenSchedule = (employeeId: number, date: string) => {
    setSelectedEmployee(employeeId);
    setSelectedDate(date);
    const existing = scheduleMap[employeeId]?.[date];
    if (existing?.shifts?.length) {
      setShifts(existing.shifts);
    } else {
      setShifts([]);
    }
    if (existing?.leaveType) {
      setLeave({ enabled: true, type: existing.leaveType as LeaveTypeValue, mode: (existing.leaveMode ?? "allDay") as "allDay" | "partial", start: existing.leaveStart ?? "09:00", end: existing.leaveEnd ?? "18:00" });
    } else {
      setLeave({ enabled: false, type: "annual", mode: "allDay", start: "09:00", end: "18:00" });
    }
    setShowModal(true);
  };

  const handleSaveSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    const leavePayload = leave.enabled ? {
      leaveType: leave.type, leaveMode: leave.mode,
      leaveStart: leave.mode === "partial" ? leave.start : null,
      leaveEnd: leave.mode === "partial" ? leave.end : null,
      leaveDuration: leave.mode === "allDay" ? 8 : calcDuration(leave.start, leave.end),
    } : { leaveType: null, leaveMode: null, leaveStart: null, leaveEnd: null, leaveDuration: null };
    upsertMutation.mutate({ employeeId: selectedEmployee, date: selectedDate, shifts, ...leavePayload });
  };

  const handleDeleteSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    const existing = scheduleMap[selectedEmployee]?.[selectedDate];
    if (!existing) {
      // 尚未儲存的排班，直接關閉 Modal 即可
      setShowModal(false);
      return;
    }
    setConfirmDeleteSchedule(true);
  };

  const handleConfirmDeleteSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    const existing = scheduleMap[selectedEmployee]?.[selectedDate];
    if (existing) {
      deleteMutation.mutate({ id: existing.id });
    } else {
      // 若排班不存在（例如尚未儲存），直接關閉
      setShowModal(false);
    }
    setConfirmDeleteSchedule(false);
  };

  const addShift = () => setShifts(prev => [...prev, { startTime: "09:00", endTime: "18:00", label: `班次${prev.length + 1}` }]);
  const removeShift = (i: number) => setShifts(prev => prev.filter((_, idx) => idx !== i));
  const updateShift = (i: number, field: string, value: string) => setShifts(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const leaveDuration = leave.mode === "allDay" ? 8 : calcDuration(leave.start, leave.end);

  // ── 時段人力計算 ─────────────────────────────────────────────────────────
  // 計算每天每30分鐘時段的在班人數與人員名單（10:00~23:00，共26個slot）
  // slot = 分鐘數 / 30，例如 slot 20 = 600min = 10:00, slot 21 = 630min = 10:30
  const SLOT_START = 20; // 10:00 = 600min / 30
  const SLOT_END = 46;   // 23:00 = 1380min / 30（不含23:00本身）
  const SLOTS = Array.from({ length: SLOT_END - SLOT_START }, (_, i) => SLOT_START + i);

  const staffingByDayHour = useMemo(() => {
    // result[dateStr][slot] = [empName, ...]
    const result: Record<string, Record<number, string[]>> = {};
    for (const d of weekDates) {
      const dateStr = toDateStr(d);
      result[dateStr] = {};
      for (let s = SLOT_START; s < SLOT_END; s++) result[dateStr][s] = [];
    }
    for (const emp of activeEmployees) {
      for (const d of weekDates) {
        const dateStr = toDateStr(d);
        const schedule = scheduleMap[emp.id]?.[dateStr];
        if (!schedule?.shifts?.length) continue;
        if (schedule.leaveType && schedule.leaveMode === "allDay") continue;
        for (const shift of schedule.shifts) {
          const [sh, sm] = shift.startTime.split(":").map(Number);
          const [eh, em] = shift.endTime.split(":").map(Number);
          const startMin = sh * 60 + sm;
          const endMin = eh * 60 + em;
          for (let s = SLOT_START; s < SLOT_END; s++) {
            const slotStart = s * 30;
            const slotEnd = (s + 1) * 30;
            if (startMin < slotEnd && endMin > slotStart) {
              if (!result[dateStr][s].includes(emp.fullName))
                result[dateStr][s].push(emp.fullName);
            }
          }
        }
      }
    }
    return result;
  }, [weekSchedules, activeEmployees, weekDates, scheduleMap]);

  const maxStaff = useMemo(() => {
    let max = 1;
    for (const dayData of Object.values(staffingByDayHour))
      for (const names of Object.values(dayData))
        if (names.length > max) max = names.length;
    return max;
  }, [staffingByDayHour]);

  return (
    <>
      <AlertDialog
        visible={!!alertMsg}
        title={alertMsg?.title ?? ""}
        message={alertMsg?.message ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      <ConfirmDialog
        visible={confirmDeleteSchedule}
        title="刪除排班"
        message="確定要刪除此日的排班嗎？"
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={handleConfirmDeleteSchedule}
        onCancel={() => setConfirmDeleteSchedule(false)}
      />
      {/* Week Navigation */}
      <View style={{ backgroundColor: "white", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#475569", fontSize: 18, lineHeight: 22 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
              {weekDates[0].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} – {weekDates[6].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}
            </Text>
            {weekOffset !== 0 && (
              <TouchableOpacity onPress={() => setWeekOffset(0)}>
                <Text style={{ fontSize: 11, color: "#2563EB", marginTop: 2 }}>回到本週</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#475569", fontSize: 18, lineHeight: 22 }}>›</Text>
          </TouchableOpacity>
          {Platform.OS === "web" && (
            <TouchableOpacity
              onPress={handlePrint}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1E40AF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>🖨 列印</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 60 }} />
          {weekDates.map((d, i) => {
            const isToday = toDateStr(d) === todayStr;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 10, color: isWeekend ? "#94A3B8" : "#64748B", fontWeight: "500" }}>{WEEKDAYS[d.getDay()]}</Text>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: isToday ? "#2563EB" : "transparent", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: isToday ? "700" : "400", color: isToday ? "white" : isWeekend ? "#94A3B8" : "#1E293B" }}>{d.getDate()}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Staffing View - Grid Design */}
      <View style={{ backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {/* Header */}
        <TouchableOpacity
          onPress={() => setShowStaffingView(v => !v)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: showStaffingView ? 8 : 12 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>⏱ 時段人力視圖</Text>
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>每小時在班人數</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: "#2563EB", fontWeight: "600" }}>{showStaffingView ? "收起 ▲" : "展開 ▼"}</Text>
        </TouchableOpacity>

        {showStaffingView && (() => {
          // 30分鐘一格，10:00~23:00
          const COL_W = 28;
          const ROW_H = 36;
          const LABEL_W = 58;
          // 將 slot 轉為時間字串，例如 slot 20 => "10:00"
          const slotToTime = (s: number) => {
            const totalMin = s * 30;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            return `${h}:${m === 0 ? "00" : "30"}`;
          };

          return (
            <View style={{ paddingBottom: 12 }}>
              {/* Popup panel */}
              {staffingPopup && (() => {
                const slotMin = staffingPopup.slot * 30;
                const endMin = slotMin + 30;
                const startLabel = slotToTime(staffingPopup.slot);
                const endH = Math.floor(endMin / 60);
                const endM = endMin % 60;
                const endLabel = `${endH}:${endM === 0 ? "00" : "30"}`;
                return (
                  <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BFDBFE" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: "#2563EB", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
                            {startLabel}–{endLabel}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, color: "#475569" }}>
                          週{["日","一","二","三","四","五","六"][new Date(staffingPopup.dateStr).getDay()]} {staffingPopup.dateStr.slice(5).replace("-", "/")}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#1D4ED8" }}>{staffingPopup.names.length} 人在班</Text>
                        <TouchableOpacity onPress={() => setStaffingPopup(null)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 13, color: "#2563EB", fontWeight: "700" }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {staffingPopup.names.length === 0 ? (
                      <Text style={{ fontSize: 13, color: "#94A3B8" }}>此時段無人排班</Text>
                    ) : (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {staffingPopup.names.map((name, i) => (
                          <View key={i} style={{ backgroundColor: "white", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#BFDBFE" }}>
                            <Text style={{ fontSize: 13, color: "#1D4ED8", fontWeight: "600" }}>{name}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Grid */}
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                  {/* Time header row */}
                  <View style={{ flexDirection: "row", marginBottom: 4 }}>
                    <View style={{ width: LABEL_W, height: 24 }} />
                    {SLOTS.map(s => {
                      const totalMin = s * 30;
                      const h = Math.floor(totalMin / 60);
                      const m = totalMin % 60;
                      const showLabel = m === 0; // 每整時顯示時間標籤
                      return (
                        <View key={s} style={{ width: COL_W, height: 24, alignItems: "center", justifyContent: "flex-end", paddingBottom: 2 }}>
                          {showLabel && (
                            <Text style={{ fontSize: 9, fontWeight: "700", color: "#374151" }}>
                              {h}時
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Day rows */}
                  {weekDates.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const isToday = dateStr === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const dayLabel = ["日","一","二","三","四","五","六"][d.getDay()];

                    return (
                      <View key={di} style={{ flexDirection: "row", marginBottom: 3 }}>
                        {/* Date label */}
                        <View style={{ width: LABEL_W, height: ROW_H, flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 6 }}>
                          <View style={{
                            width: 28, height: 28, borderRadius: 14,
                            backgroundColor: isToday ? "#2563EB" : isWeekend ? "#F1F5F9" : "#F8FAFC",
                            alignItems: "center", justifyContent: "center",
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: isToday ? "white" : isWeekend ? "#94A3B8" : "#475569" }}>
                              {dayLabel}
                            </Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: isWeekend ? "#94A3B8" : "#374151", lineHeight: 13 }}>
                              {d.getMonth() + 1}/{d.getDate()}
                            </Text>
                            {isToday && (
                              <View style={{ backgroundColor: "#2563EB", borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, alignSelf: "flex-start" }}>
                                <Text style={{ fontSize: 8, color: "white", fontWeight: "700" }}>今天</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* 30-min slot cells */}
                        {SLOTS.map(s => {
                          const names = staffingByDayHour[dateStr]?.[s] ?? [];
                          const count = names.length;
                          const isActive = staffingPopup?.dateStr === dateStr && staffingPopup?.slot === s;
                          const totalMin = s * 30;
                          const m = totalMin % 60;
                          const isHalfHour = m === 30;
                          const bg = isActive ? "#1D4ED8"
                            : count === 0 ? (isWeekend ? "#F9FAFB" : "#F3F4F6")
                            : count <= 2 ? "#DBEAFE"
                            : count <= 4 ? "#93C5FD"
                            : "#3B82F6";
                          const textColor = isActive || count > 4 ? "white" : count > 0 ? "#1D4ED8" : "#D1D5DB";

                          return (
                            <TouchableOpacity
                              key={s}
                              onPress={() => setStaffingPopup(isActive ? null : { dateStr, slot: s, names })}
                              style={{
                                width: COL_W,
                                height: ROW_H,
                                backgroundColor: bg,
                                borderRadius: 3,
                                marginHorizontal: 0.5,
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: isActive ? 2 : 0,
                                borderColor: "#1D4ED8",
                                // 半整時格左邊加一條細線區分小時
                                borderLeftWidth: isHalfHour ? 1 : 0,
                                borderLeftColor: "#E5E7EB",
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: textColor }}>
                                {count > 0 ? count : ""}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}

                  {/* Legend */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: LABEL_W, paddingTop: 8, paddingBottom: 4 }}>
                    <Text style={{ fontSize: 11, color: "#9CA3AF" }}>人數：</Text>
                    {[
                      { bg: "#F3F4F6", label: "0人" },
                      { bg: "#DBEAFE", label: "1–2人" },
                      { bg: "#93C5FD", label: "3–4人" },
                      { bg: "#3B82F6", label: "5人以上" },
                    ].map((item, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 16, height: 16, backgroundColor: item.bg, borderRadius: 3, borderWidth: 1, borderColor: "#E5E7EB" }} />
                        <Text style={{ fontSize: 11, color: "#6B7280" }}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          );
        })()}
      </View>

      {/* Employee Rows */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {activeEmployees.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>尚無員工資料</Text>
          </View>
        ) : activeEmployees.map((emp) => (
          <View key={emp.id} style={{ backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", alignItems: "stretch", paddingVertical: 8 }}>
            <View style={{ width: 60, paddingLeft: 10, justifyContent: "center" }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>{emp.fullName[0]}</Text>
              </View>
              <Text style={{ fontSize: 9, fontWeight: "600", color: "#1E293B" }} numberOfLines={2}>{emp.fullName}</Text>
            </View>
            {weekDates.map((d, i) => {
              const dateStr = toDateStr(d);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = dateStr === todayStr;
              const schedule = scheduleMap[emp.id]?.[dateStr];
              const hasSchedule = !!schedule?.shifts?.length;
              const leaveInfo = schedule?.leaveType ? LEAVE_TYPES.find(lt => lt.value === schedule.leaveType) : null;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleOpenSchedule(emp.id, dateStr)}
                  style={{
                    flex: 1, minHeight: 64, marginHorizontal: 1, borderRadius: 6,
                    backgroundColor: leaveInfo ? leaveInfo.bg : hasSchedule ? (isToday ? "#DBEAFE" : "#EFF6FF") : (isWeekend ? "#F8FAFC" : "#FAFAFA"),
                    alignItems: "center", justifyContent: "center",
                    borderWidth: isToday ? 1 : 0, borderColor: isToday ? "#93C5FD" : "transparent", padding: 2,
                  }}
                >
                  {leaveInfo ? (
                    <View style={{ alignItems: "center", gap: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: leaveInfo.color, lineHeight: 12 }}>{leaveInfo.label}</Text>
                      {schedule?.leaveMode === "partial" && schedule.leaveDuration ? (
                        <Text style={{ fontSize: 8, color: leaveInfo.color, lineHeight: 11 }}>{parseFloat(schedule.leaveDuration).toFixed(1)}h</Text>
                      ) : (
                        <Text style={{ fontSize: 8, color: leaveInfo.color, lineHeight: 11 }}>整天</Text>
                      )}
                    </View>
                  ) : hasSchedule ? (
                    <View style={{ alignItems: "center", gap: 1 }}>
                      {schedule.shifts.map((sh, si) => (
                        <View key={si} style={{ alignItems: "center" }}>
                          <Text style={{ fontSize: 8, color: "#1D4ED8", fontWeight: "700", lineHeight: 11 }}>{sh.startTime}</Text>
                          <Text style={{ fontSize: 7, color: "#93C5FD", lineHeight: 9 }}>↓</Text>
                          <Text style={{ fontSize: 8, color: "#1D4ED8", fontWeight: "700", lineHeight: 11 }}>{sh.endTime}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 9, color: "#CBD5E1" }}>—</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Schedule Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>設定班表</Text>
            <TouchableOpacity onPress={handleSaveSchedule} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? <ActivityIndicator size="small" color="#2563EB" /> : <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>儲存</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Info Card */}
            <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#2563EB" }}>{employees?.find(e => e.id === selectedEmployee)?.fullName?.[0] ?? "?"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{employees?.find(e => e.id === selectedEmployee)?.fullName ?? "員工"}</Text>
                <Text style={{ fontSize: 13, color: "#64748B" }}>{selectedDate}</Text>
              </View>
              {selectedEmployee && selectedDate && scheduleMap[selectedEmployee]?.[selectedDate] && (
                <TouchableOpacity onPress={handleDeleteSchedule} style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: "#EF4444", fontWeight: "600" }}>刪除</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Leave Section */}
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: leave.enabled ? 14 : 0 }}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>請假標記</Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>標記後仍可保留班次資訊</Text>
                </View>
                <Switch value={leave.enabled} onValueChange={v => setLeave(p => ({ ...p, enabled: v }))} trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }} thumbColor={leave.enabled ? "#2563EB" : "#94A3B8"} />
              </View>
              {leave.enabled && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>請假種類</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {LEAVE_TYPES.map(lt => (
                        <TouchableOpacity key={lt.value} onPress={() => setLeave(p => ({ ...p, type: lt.value }))} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: leave.type === lt.value ? lt.bg : "#F8FAFC", borderWidth: 1.5, borderColor: leave.type === lt.value ? lt.color : "#E2E8F0" }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: leave.type === lt.value ? lt.color : "#94A3B8" }}>{lt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>請假方式</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                    {[{ value: "allDay", label: "整天（8小時）" }, { value: "partial", label: "指定時段" }].map(m => (
                      <TouchableOpacity key={m.value} onPress={() => setLeave(p => ({ ...p, mode: m.value as "allDay" | "partial" }))} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: leave.mode === m.value ? "#EFF6FF" : "#F8FAFC", borderWidth: 1.5, borderColor: leave.mode === m.value ? "#2563EB" : "#E2E8F0", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: leave.mode === m.value ? "#2563EB" : "#94A3B8" }}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {leave.mode === "partial" && (
                    <View>
                      <View style={{ flexDirection: "row", gap: 16, justifyContent: "center", marginBottom: 12 }}>
                        <TimePickerWheel label="開始時間" value={leave.start} onChange={v => setLeave(p => ({ ...p, start: v }))} />
                        <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 20 }}>
                          <Text style={{ fontSize: 20, color: "#94A3B8" }}>→</Text>
                        </View>
                        <TimePickerWheel label="結束時間" value={leave.end} onChange={v => setLeave(p => ({ ...p, end: v }))} />
                      </View>
                      <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: 10, alignItems: "center" }}>
                        <Text style={{ fontSize: 13, color: "#16A34A", fontWeight: "600" }}>
                          請假時長：{leaveDuration > 0 ? `${leaveDuration} 小時` : "請確認時間設定"}
                        </Text>
                      </View>
                    </View>
                  )}
                  {leave.mode === "allDay" && (
                    <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: 10, alignItems: "center" }}>
                      <Text style={{ fontSize: 13, color: "#16A34A", fontWeight: "600" }}>請假時長：整天（8 小時）</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Shift Section */}
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 10 }}>班次設定</Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8", marginBottom: 8 }}>快速套用</Text>
              {/* 休假按鈕常驅 */}
              <View style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    setShifts([]);
                    setLeave({ enabled: true, type: "other" as LeaveTypeValue, mode: "allDay", start: "09:00", end: "18:00" });
                  }}
                  style={{ alignSelf: "flex-start", backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#64748B", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748B" }}>休假</Text>
                </TouchableOpacity>
              </View>
              {/* 依分組顯示班次按鈕 */}
              {(() => {
                const activeShifts = (workShifts ?? []).filter(ws => ws.isActive);
                const assignedIds = new Set(shiftGroups.flatMap(g => g.shiftIds));
                const ungrouped = activeShifts.filter(ws => !assignedIds.has(ws.id));
                const renderShiftBtn = (ws: typeof activeShifts[0]) => (
                  <TouchableOpacity
                    key={ws.id}
                    onPress={() => {
                      setLeave(p => ({ ...p, enabled: false }));
                      setShifts(prev => [...prev, { startTime: ws.startTime, endTime: ws.endTime, label: ws.name }]);
                    }}
                    style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#2563EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563EB" }}>{ws.name}</Text>
                    <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{ws.startTime} ~ {ws.endTime}</Text>
                  </TouchableOpacity>
                );
                const hasGroups = shiftGroups.filter(g => g.name.trim()).length > 0;
                return (
                  <>
                    {shiftGroups.filter(g => g.name.trim()).map(group => {
                      const groupShifts = activeShifts.filter(ws => group.shiftIds.includes(ws.id));
                      if (groupShifts.length === 0) return null;
                      return (
                        <View key={group.id} style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600", marginBottom: 6 }}>{group.name}</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {groupShifts.map(renderShiftBtn)}
                            </View>
                          </ScrollView>
                        </View>
                      );
                    })}
                    {ungrouped.length > 0 && (
                      <View style={{ marginBottom: 4 }}>
                        {hasGroups && <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600", marginBottom: 6 }}>其他</Text>}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {ungrouped.map(renderShiftBtn)}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
            {shifts.map((shift, i) => (
              <View key={i} style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <TextInput value={shift.label} onChangeText={v => updateShift(i, "label", v)} style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", flex: 1 }} returnKeyType="done" />
                  {shifts.length > 1 && <TouchableOpacity onPress={() => removeShift(i)}><Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "500" }}>移除</Text></TouchableOpacity>}
                </View>
                <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
                  <TimePickerWheel label="上班時間" value={shift.startTime} onChange={v => updateShift(i, "startTime", v)} />
                  <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 20 }}>
                    <Text style={{ fontSize: 20, color: "#94A3B8" }}>→</Text>
                  </View>
                  <TimePickerWheel label="下班時間" value={shift.endTime} onChange={v => updateShift(i, "endTime", v)} />
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={addShift} style={{ borderWidth: 1.5, borderColor: "#2563EB", borderStyle: "dashed", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: "#2563EB", fontSize: 14, fontWeight: "600" }}>+ 新增班次</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTH TAB
// ═══════════════════════════════════════════════════════════════════════════
function MonthTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: allSchedules, refetch: refetchMonth } = trpc.schedules.getWeekAll.useQuery(
    { startDate, endDate },
    { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: monthSettingsData } = trpc.settings.getAll.useQuery();
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.isActive) ?? [], [allEmployees]);

  // 解析分組設定
  const monthShiftGroups = useMemo(() => {
    if (!monthSettingsData?.shift_groups) return [] as Array<{ id: string; name: string; shiftIds: number[] }>;
    try {
      const parsed = JSON.parse(monthSettingsData.shift_groups);
      return Array.isArray(parsed) ? parsed as Array<{ id: string; name: string; shiftIds: number[] }> : [];
    } catch { return []; }
  }, [monthSettingsData]);

  // 從分組設定取得分組名稱（以員工 ID 為鍵）——注意：分組是對班次的，這裡我們用員工的 tag 屬性分組
  // 所以我們用 monthShiftGroups 的名稱來分區員工，但這裡分組是對班次的
  // 我們需要一個方式：將員工按「最常用班次所屬分組」分類
  // 簡化方式：將 monthShiftGroups 的名稱當作員工分區標籤

  const scheduleMap = useMemo(() => {
    const map: Record<string, Record<number, { shifts: ShiftEntry[]; leaveType?: string | null; leaveMode?: string | null; leaveDuration?: string | null }>> = {};
    for (const s of (allSchedules ?? []) as Array<{ date: string | Date; employeeId: number; shifts: unknown; leaveType?: string | null; leaveMode?: string | null; leaveDuration?: string | null }>) {
      const dateStr = typeof s.date === "string" ? s.date.slice(0, 10) : new Date(s.date as Date).toISOString().slice(0, 10);
      if (!map[dateStr]) map[dateStr] = {};
      map[dateStr][s.employeeId] = { shifts: s.shifts as ShiftEntry[], leaveType: s.leaveType, leaveMode: s.leaveMode, leaveDuration: s.leaveDuration };
    }
    return map;
  }, [allSchedules]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); setSelectedDate(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); setSelectedDate(null); };

  const handleMonthPrint = () => {
    if (Platform.OS !== 'web') return;
    const LEAVE_LABEL: Record<string, { label: string; bg: string; color: string }> = {
      annual:      { label: '特休', bg: '#EFF6FF', color: '#2563EB' },
      sick:        { label: '病假', bg: '#FEF2F2', color: '#DC2626' },
      personal:    { label: '事假', bg: '#FFFBEB', color: '#D97706' },
      marriage:    { label: '婚假', bg: '#F5F3FF', color: '#7C3AED' },
      bereavement: { label: '喪假', bg: '#F8FAFC', color: '#475569' },
      official:    { label: '公假', bg: '#ECFEFF', color: '#0891B2' },
      other:       { label: '休假', bg: '#F1F5F9', color: '#64748B' },
    };
    const TAG_LABEL: Record<string, string> = { indoor: '內場', outdoor: '外場', supervisor: '幹部' };
    const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    const daysCount = getDaysInMonth(year, month);
    const monthName = `${year} 年 ${month + 1} 月`;
    const printDate = new Date().toLocaleDateString('zh-TW');
    // 過濾掉管理員帳號（M 和系統管理員）
    const printEmployees = activeEmployees.filter(e => e.fullName !== 'M' && e.fullName !== '系統管理員' && (e as any).tag !== 'admin');
    const totalEmployees = printEmployees.length;

    // Build column headers (day 1..daysCount)
    const dayHeaders = Array.from({ length: daysCount }, (_, i) => {
      const d = i + 1;
      const dateStr = fmtDate(year, month, d);
      const dow = new Date(year, month, d).getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday = dateStr === new Date().toISOString().slice(0, 10);
      const bgColor = isToday ? '#DBEAFE' : isWeekend ? '#F8FAFC' : '#1E40AF';
      const textColor = isToday ? '#1D4ED8' : isWeekend ? '#64748B' : 'white';
      return `<th style="background:${bgColor};color:${textColor};padding:2px 1px;font-size:8px;text-align:center;border:1px solid #CBD5E1;white-space:nowrap">
        <div style="font-weight:700">${d}</div>
        <div style="font-size:7px;margin-top:1px">${WEEKDAY_LABELS[dow]}</div>
      </th>`;
    }).join('');

    // Build employee row helper
    const buildEmpRow = (emp: typeof printEmployees[0]) => {
      const tagLabel = TAG_LABEL[(emp as any).tag ?? ''] ?? '';
      const cells = Array.from({ length: daysCount }, (_, i) => {
        const d = i + 1;
        const dateStr = fmtDate(year, month, d);
        const dow = new Date(year, month, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const dayData = scheduleMap[dateStr]?.[emp.id];
        let cellBg = isWeekend ? '#F8FAFC' : 'white';
        let cellContent = `<span style="color:#CBD5E1">—</span>`;
        if (dayData?.leaveType) {
          const lt = LEAVE_LABEL[dayData.leaveType];
          if (lt) {
            cellBg = lt.bg;
            cellContent = `<span style="color:${lt.color};font-weight:700;font-size:8px">${lt.label}</span>`;
          }
        } else if (dayData?.shifts?.length) {
          cellBg = '#EFF6FF';
          cellContent = dayData.shifts.map((sh: ShiftEntry) =>
            `<div style="font-size:7px;color:#1D4ED8;font-weight:600;line-height:1.2">${sh.startTime}<br/>${sh.endTime}</div>`
          ).join('<div style="border-top:1px dashed #BFDBFE;margin:1px 0"></div>');
        }
        return `<td style="background:${cellBg};padding:2px 1px;text-align:center;border:1px solid #E2E8F0;vertical-align:middle">${cellContent}</td>`;
      }).join('');
      return `<tr>
        <td style="padding:3px 5px;border:1px solid #E2E8F0;white-space:nowrap;background:#F8FAFC;font-size:9px;font-weight:600;color:#1E293B">${emp.fullName}<br/><span style="font-size:7px;color:#64748B;font-weight:400">${tagLabel}</span></td>
        ${cells}
      </tr>`;
    };

    // Build employee rows with group headers
    const groupSeparatorRow = (groupName: string, bgColor: string, textColor: string) =>
      `<tr><td colspan="${daysCount + 1}" style="background:${bgColor};padding:3px 6px;font-size:9px;font-weight:700;color:${textColor};border:1px solid #CBD5E1;letter-spacing:0.5px">${groupName}</td></tr>`;

    let rows = '';
    const validGroups = monthShiftGroups.filter(g => g.name.trim());
    if (validGroups.length > 0) {
      // 依分組設定的順序顯示分區標題，並將屬於該分組的班次的員工排列在其下
      // 注意：分組是對班次的，我們用 tag 屬性將員工分區，並使用分組名稱作為標題
      // 將分組名稱映射到 tag：如果分組名稱包含「內場」就對應 indoor，「外場」對應 outdoor，「干部」對應 supervisor
      // 其他分組名稱就直接用分組名稱顯示，並將未被其他分組包含的員工放入對應分組
      const tagToGroupName: Record<string, string> = {};
      validGroups.forEach(g => {
        const n = g.name;
        if (n.includes('內場')) tagToGroupName['indoor'] = n;
        else if (n.includes('外場')) tagToGroupName['outdoor'] = n;
        else if (n.includes('干部') || n.includes('主管')) tagToGroupName['supervisor'] = n;
      });
      // 對每個分組，找出屬於該分組 tag 的員工
      const groupColors = ['#EFF6FF', '#F0FDF4', '#FFF7ED', '#F5F3FF', '#ECFEFF', '#FEF2F2'];
      const groupTextColors = ['#1D4ED8', '#15803D', '#C2410C', '#7C3AED', '#0891B2', '#DC2626'];
      const renderedEmpIds = new Set<number>();
      validGroups.forEach((group, gi) => {
        const bg = groupColors[gi % groupColors.length];
        const tc = groupTextColors[gi % groupTextColors.length];
        // 找出該分組對應的 tag
        const matchedTag = Object.entries(tagToGroupName).find(([, v]) => v === group.name)?.[0];
        let groupEmps: typeof printEmployees;
        if (matchedTag) {
          groupEmps = printEmployees.filter(e => (e as any).tag === matchedTag);
        } else {
          // 其他分組：將尚未被分配的員工放入最後一個分組
          groupEmps = [];
        }
        if (groupEmps.length > 0) {
          rows += groupSeparatorRow(group.name, bg, tc);
          groupEmps.forEach(emp => { rows += buildEmpRow(emp); renderedEmpIds.add(emp.id); });
        }
      });
      // 未分組的員工
      const ungroupedEmps = printEmployees.filter(e => !renderedEmpIds.has(e.id));
      if (ungroupedEmps.length > 0) {
        rows += groupSeparatorRow('其他', '#F8FAFC', '#64748B');
        ungroupedEmps.forEach(emp => { rows += buildEmpRow(emp); });
      }
    } else {
      // 沒有分組設定，用原本 tag 分區
      const tagGroups = [
        { tag: 'indoor', label: '內場', bg: '#EFF6FF', tc: '#1D4ED8' },
        { tag: 'outdoor', label: '外場', bg: '#F0FDF4', tc: '#15803D' },
        { tag: 'supervisor', label: '干部', bg: '#FFF7ED', tc: '#C2410C' },
      ];
      const renderedEmpIds = new Set<number>();
      tagGroups.forEach(({ tag, label, bg, tc }) => {
        const groupEmps = printEmployees.filter(e => (e as any).tag === tag);
        if (groupEmps.length > 0) {
          rows += groupSeparatorRow(label, bg, tc);
          groupEmps.forEach(emp => { rows += buildEmpRow(emp); renderedEmpIds.add(emp.id); });
        }
      });
      const ungroupedEmps = printEmployees.filter(e => !renderedEmpIds.has(e.id));
      if (ungroupedEmps.length > 0) {
        rows += groupSeparatorRow('其他', '#F8FAFC', '#64748B');
        ungroupedEmps.forEach(emp => { rows += buildEmpRow(emp); });
      }
    }

    // Build daily count rows
    const countRow = (label: string, filterFn: (emp: typeof printEmployees[0]) => boolean, bg: string, color: string) => {
      const cells = Array.from({ length: daysCount }, (_, i) => {
        const d = i + 1;
        const dateStr = fmtDate(year, month, d);
        const dow = new Date(year, month, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const count = activeEmployees.filter(emp => {
          if (!filterFn(emp)) return false;
          const dayData = scheduleMap[dateStr]?.[emp.id];
          return dayData?.shifts?.length && !dayData?.leaveType;
        }).length;
        const cellBg = isWeekend ? '#F1F5F9' : bg;
        return `<td style="background:${cellBg};padding:2px 1px;text-align:center;border:1px solid #E2E8F0;font-size:8px;font-weight:700;color:${count > 0 ? color : '#CBD5E1'}">${count > 0 ? count : '—'}</td>`;
      }).join('');
      return `<tr>
        <td style="padding:3px 5px;border:1px solid #E2E8F0;background:${bg};font-size:9px;font-weight:700;color:${color};white-space:nowrap">${label}</td>
        ${cells}
      </tr>`;
    };
    const statsRows = [
      countRow('上班人數', () => true, '#F0FDF4', '#15803D'),
      countRow('內場', (e) => (e as any).tag === 'indoor', '#EFF6FF', '#1D4ED8'),
      countRow('外場', (e) => (e as any).tag === 'outdoor', '#F0FDF4', '#15803D'),
    ].join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${monthName}排班表</title>
<style>
  body { font-family: -apple-system, "Microsoft JhengHei", sans-serif; margin: 0; padding: 8px; }
  h1 { font-size: 14px; color: #1E293B; margin: 0 0 2px; }
  .meta { font-size: 9px; color: #64748B; margin-bottom: 6px; }
  .legend { display: flex; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 3px; font-size: 9px; color: #475569; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td, th { overflow: hidden; }
  @media print {
    html, body { width: 297mm; height: 210mm; }
    body { padding: 3mm; margin: 0; }
    button { display: none !important; }
    @page { size: A4 landscape; margin: 5mm; }
    table { font-size: 7px; }
  }
</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
  <div>
    <h1>好好上班 —— ${monthName}排班表</h1>
    <div class="meta">列印時間：${printDate} &nbsp; 共 ${totalEmployees} 位員工</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#475569;line-height:1.6">
    <div>內場 ● 外場 ● 幹部</div>
    <div>橫向 A4 / 每格顯示班次時間</div>
    <button onclick="window.print()" style="margin-top:4px;background:#1E40AF;color:white;border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:600">🖨 列印</button>
  </div>
</div>
<div class="legend">
  <div class="legend-item"><span class="legend-dot" style="background:#EFF6FF;border:1px solid #BFDBFE"></span> 正常上班</div>
  <div class="legend-item"><span class="legend-dot" style="background:#FEF2F2;border:1px solid #FECACA"></span> 請假</div>
  <div class="legend-item"><span class="legend-dot" style="background:#F8FAFC;border:1px solid #E2E8F0"></span> 休假日（六日）</div>
  <div class="legend-item"><span class="legend-dot" style="background:#DBEAFE;border:1px solid #93C5FD"></span> 今日</div>
</div>
<table>
  <thead><tr><th style="background:#1E40AF;color:white;padding:3px 5px;font-size:9px;text-align:left;border:1px solid #CBD5E1;min-width:40px;max-width:50px">員工</th>${dayHeaders}</tr></thead>
  <tbody>${rows}${statsRows}</tbody>
</table>
<div style="margin-top:8px;font-size:10px;color:#94A3B8;text-align:right">＊本表為示意預覽，實際列印將使用資料庫即時資料</div>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDow(year, month);
  const todayStr = today.toISOString().slice(0, 10);

  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDow; i++) calendarCells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push({ day: d, dateStr: fmtDate(year, month, d) });
  while (calendarCells.length % 7 !== 0) calendarCells.push({ day: null, dateStr: null });

  const selectedDaySchedules = selectedDate ? scheduleMap[selectedDate] ?? {} : {};
  const filteredEmployees = activeEmployees.filter(e => selectedEmployeeId === null || e.id === selectedEmployeeId);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 12 }}>
      {/* Calendar Card */}
      <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
          <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 20, color: "#2563EB" }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>{year} 年 {month + 1} 月</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {Platform.OS === "web" && (
              <TouchableOpacity onPress={handleMonthPrint} style={{ backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, color: "white", fontWeight: "600" }}>🖨 列印</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
              <Text style={{ fontSize: 20, color: "#2563EB" }}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
          {WEEKDAYS.map((d, i) => (
            <View key={d} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: i === 0 || i === 6 ? "#EF4444" : "#94A3B8" }}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={{ paddingHorizontal: 8, paddingBottom: 12 }}>
          {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
            <View key={row} style={{ flexDirection: "row", marginBottom: 2 }}>
              {calendarCells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                if (!cell.day || !cell.dateStr) return <View key={col} style={{ flex: 1, height: 54 }} />;
                const isToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedDate;
                const daySchedules = scheduleMap[cell.dateStr] ?? {};
                const scheduledCount = Object.keys(daySchedules).length;
                const dow = (firstDow + cell.day - 1) % 7;
                const isWeekend = dow === 0 || dow === 6;
                // Check if any employee has leave that day
                const leaveCount = Object.values(daySchedules).filter(s => s.leaveType).length;
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setSelectedDate(isSelected ? null : cell.dateStr!)}
                    style={{ flex: 1, height: 60, alignItems: "center", paddingTop: 6, borderRadius: 8, marginHorizontal: 1, backgroundColor: isSelected ? "#DBEAFE" : "transparent", borderWidth: isSelected ? 1.5 : 0, borderColor: isSelected ? "#2563EB" : "transparent" }}
                  >
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isToday ? "#2563EB" : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 13, fontWeight: isToday || isSelected ? "700" : "400", color: isToday ? "white" : isWeekend ? "#EF4444" : "#1E293B" }}>{cell.day}</Text>
                    </View>
                    {scheduledCount > 0 && (
                      <View style={{ marginTop: 2, backgroundColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, color: "#1D4ED8", fontWeight: "600" }}>{scheduledCount}人</Text>
                      </View>
                    )}
                    {leaveCount > 0 && (
                      <View style={{ marginTop: 1, backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 8, color: "#DC2626", fontWeight: "600" }}>假{leaveCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 4, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 9, color: "white", fontWeight: "700" }}>今</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#64748B" }}>今日</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ backgroundColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, color: "#1D4ED8", fontWeight: "600" }}>N人</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#64748B" }}>已排班</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, color: "#DC2626", fontWeight: "600" }}>假N</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#64748B" }}>請假人數</Text>
        </View>
      </View>

      {/* Selected Date Detail */}
      {selectedDate && (
        <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>{selectedDate.replace(/-/g, " / ")} 排班明細</Text>
            <TouchableOpacity onPress={() => setSelectedDate(null)}>
              <Text style={{ fontSize: 20, color: "#94A3B8" }}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <View style={{ flexDirection: "row", padding: 10, gap: 8 }}>
              <TouchableOpacity onPress={() => setSelectedEmployeeId(null)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: selectedEmployeeId === null ? "#2563EB" : "#F1F5F9" }}>
                <Text style={{ fontSize: 12, color: selectedEmployeeId === null ? "white" : "#64748B", fontWeight: "600" }}>全部</Text>
              </TouchableOpacity>
              {activeEmployees.map(emp => (
                <TouchableOpacity key={emp.id} onPress={() => setSelectedEmployeeId(emp.id === selectedEmployeeId ? null : emp.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: selectedEmployeeId === emp.id ? "#2563EB" : "#F1F5F9" }}>
                  <Text style={{ fontSize: 12, color: selectedEmployeeId === emp.id ? "white" : "#64748B", fontWeight: "600" }}>{emp.fullName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {filteredEmployees.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94A3B8" }}>今日尚無排班</Text>
            </View>
          ) : filteredEmployees.map((emp, i) => {
            const dayData = selectedDaySchedules[emp.id];
            const hasShift = dayData?.shifts?.length > 0;
            const leaveInfo = dayData?.leaveType ? LEAVE_TYPES.find(lt => lt.value === dayData.leaveType) : null;
            return (
              <View key={emp.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < filteredEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: hasShift ? "#EFF6FF" : "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: hasShift ? "#2563EB" : "#CBD5E1" }}>{emp.fullName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: hasShift ? "#1E293B" : "#94A3B8" }}>{emp.fullName}</Text>
                  {leaveInfo ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <View style={{ backgroundColor: leaveInfo.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, color: leaveInfo.color, fontWeight: "700" }}>{leaveInfo.label}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: "#64748B" }}>
                        {dayData?.leaveMode === "partial" && dayData.leaveDuration ? `${parseFloat(dayData.leaveDuration).toFixed(1)} 小時` : "整天"}
                      </Text>
                    </View>
                  ) : hasShift ? (
                    <View style={{ marginTop: 3, gap: 2 }}>
                      {dayData.shifts.map((shift, si) => (
                        <View key={si} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#2563EB" }} />
                          <Text style={{ fontSize: 12, color: "#475569" }}>{shift.label ? `${shift.label}  ` : ""}{shift.startTime} – {shift.endTime}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2 }}>未排班</Text>
                  )}
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: leaveInfo ? leaveInfo.bg : hasShift ? "#DCFCE7" : "#F1F5F9" }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: leaveInfo ? leaveInfo.color : hasShift ? "#16A34A" : "#94A3B8" }}>
                    {leaveInfo ? leaveInfo.label : hasShift ? "排班中" : "未排班"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Monthly Summary */}
      <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>本月排班統計</Text>
        </View>
        {activeEmployees.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#94A3B8" }}>尚無員工資料</Text>
          </View>
        ) : activeEmployees.map((emp, i) => {
          const scheduledDays = Object.values(scheduleMap).filter(dayMap => dayMap[emp.id]?.shifts?.length > 0).length;
          const leaveDays = Object.values(scheduleMap).filter(dayMap => dayMap[emp.id]?.leaveType).length;
          return (
            <View key={emp.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: i < activeEmployees.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC" }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>{emp.fullName[0]}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: "#1E293B", fontWeight: "500" }}>{emp.fullName}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: scheduledDays > 0 ? "#2563EB" : "#94A3B8" }}>{scheduledDays}</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8" }}>排班天</Text>
                </View>
                {leaveDays > 0 && (
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#DC2626" }}>{leaveDays}</Text>
                    <Text style={{ fontSize: 10, color: "#94A3B8" }}>請假天</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WORK SHIFTS TAB
// ═══════════════════════════════════════════════════════════════════════════
type WorkShift = { id: number; name: string; startTime: string; endTime: string; isDefaultWeekday: boolean; isDefaultHoliday: boolean; isActive: boolean; sortOrder: number };
type ShiftGroup = { id: string; name: string; shiftIds: number[] };
const INITIAL_FORM = { name: "", startTime: "09:00", endTime: "18:00", isDefaultWeekday: false, isDefaultHoliday: false };

function WorkShiftsTab() {
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<typeof INITIAL_FORM>(INITIAL_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<{ id: number; name: string } | null>(null);
  const [localShifts, setLocalShifts] = useState<WorkShift[]>([]);

  // 分組管理狀態
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groups, setGroups] = useState<ShiftGroup[]>([]);
  const [groupsSaving, setGroupsSaving] = useState(false);

  const { data: shifts, refetch, isLoading } = trpc.workShifts.list.useQuery();
  const createMutation = trpc.workShifts.create.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const updateMutation = trpc.workShifts.update.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const deleteMutation = trpc.workShifts.delete.useMutation({ onSuccess: () => refetch() });
  const reorderMutation = trpc.workShifts.reorder.useMutation();
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.getAll.useQuery();
  const setSettingMutation = trpc.settings.set.useMutation();

  // Sync local state when server data arrives
  useEffect(() => { if (shifts) setLocalShifts(shifts as WorkShift[]); }, [shifts]);

  // 載入分組設定
  useEffect(() => {
    if (settingsData && settingsData.shift_groups) {
      try {
        const parsed = JSON.parse(settingsData.shift_groups);
        if (Array.isArray(parsed)) setGroups(parsed);
      } catch {}
    }
  }, [settingsData]);

  // 全域排序（未分組區塊使用）
  const moveShift = (index: number, direction: "up" | "down", shiftList: WorkShift[]) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= shiftList.length) return;
    // 在全域 localShifts 中找到這兩個元素並交換
    const newList = [...localShifts];
    const idA = shiftList[index].id;
    const idB = shiftList[targetIndex].id;
    const globalA = newList.findIndex(s => s.id === idA);
    const globalB = newList.findIndex(s => s.id === idB);
    if (globalA === -1 || globalB === -1) return;
    [newList[globalA], newList[globalB]] = [newList[globalB], newList[globalA]];
    setLocalShifts(newList);
    reorderMutation.mutate({ orderedIds: newList.map(s => s.id) });
  };

  // 分組內部排序
  const moveShiftInGroup = (groupId: string, index: number, direction: "up" | "down", groupShifts: WorkShift[]) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groupShifts.length) return;
    const newGroupShiftIds = groupShifts.map(s => s.id);
    [newGroupShiftIds[index], newGroupShiftIds[targetIndex]] = [newGroupShiftIds[targetIndex], newGroupShiftIds[index]];
    const newGroups = groups.map(g => g.id === groupId ? { ...g, shiftIds: newGroupShiftIds } : g);
    setGroups(newGroups);
    // 儲存分組設定
    setSettingMutation.mutate({ key: "shift_groups", value: JSON.stringify(newGroups) });
  };

  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const openCreate = () => { setEditId(null); setForm(INITIAL_FORM); setFormError(""); setShowModal(true); };
  const openEdit = (shift: WorkShift) => { setEditId(shift.id); setForm({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime, isDefaultWeekday: shift.isDefaultWeekday, isDefaultHoliday: shift.isDefaultHoliday }); setFormError(""); setShowModal(true); };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError("請輸入班次名稱"); return; }
    const payload = { name: form.name.trim(), startTime: form.startTime, endTime: form.endTime, isDefaultWeekday: form.isDefaultWeekday, isDefaultHoliday: form.isDefaultHoliday };
    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const handleDelete = (id: number, name: string) => {
    setConfirmDeleteShift({ id, name });
  };

  // 分組管理函數
  const openGroupModal = () => {
    setShowGroupModal(true);
  };

  const addGroup = () => {
    const newGroup: ShiftGroup = {
      id: Date.now().toString(),
      name: "",
      shiftIds: [],
    };
    setGroups(prev => [...prev, newGroup]);
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  };

  const toggleShiftInGroup = (groupId: string, shiftId: number) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const has = g.shiftIds.includes(shiftId);
      return { ...g, shiftIds: has ? g.shiftIds.filter(id => id !== shiftId) : [...g.shiftIds, shiftId] };
    }));
  };

  const deleteGroup = (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const saveGroups = async () => {
    setGroupsSaving(true);
    try {
      await setSettingMutation.mutateAsync({ key: "shift_groups", value: JSON.stringify(groups) });
      await refetchSettings();
      setShowGroupModal(false);
    } finally {
      setGroupsSaving(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        visible={!!confirmDeleteShift}
        title="刪除班次"
        message={`確定要刪除「${confirmDeleteShift?.name ?? ""}」班次嗎？`}
        confirmText="刪除"
        confirmStyle="destructive"
        onConfirm={() => { if (confirmDeleteShift) deleteMutation.mutate({ id: confirmDeleteShift.id }); setConfirmDeleteShift(null); }}
        onCancel={() => setConfirmDeleteShift(null)}
      />
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <TouchableOpacity onPress={openGroupModal} style={{ backgroundColor: "#F1F5F9", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ color: "#475569", fontWeight: "600", fontSize: 14 }}>⊞ 管理分組</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openCreate} style={{ backgroundColor: "#2563EB", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>+ 新增班次</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : localShifts.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
          <Text style={{ fontSize: 15, color: "#94A3B8" }}>尚未設定工作班次</Text>
          <Text style={{ fontSize: 13, color: "#CBD5E1", marginTop: 4 }}>請先新增班次，才能在週排班快速套用</Text>
        </View>
      ) : (
        <>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
          {(() => {
            // 建立分組顯示結構
            const assignedShiftIds = new Set(groups.flatMap(g => g.shiftIds));
            const ungroupedShifts = localShifts.filter(s => !assignedShiftIds.has(s.id));

            // renderShiftCard 接受獨立的 onMoveUp/onMoveDown，讓分組和未分組各自排序不互相影響
            const renderShiftCard = (
              item: WorkShift,
              index: number,
              listLength: number,
              onMoveUp: () => void,
              onMoveDown: () => void
            ) => (
              <View
                key={`${item.id}`}
                style={{
                  backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1,
                  borderColor: "#F1F5F9",
                  shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05, shadowRadius: 3,
                  elevation: 1,
                  marginBottom: 8,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  {/* 上移/下移按鈕 - 在各自清單內獨立排序 */}
                  <View style={{ flexDirection: "column", gap: 2, paddingRight: 10 }}>
                    <TouchableOpacity
                      onPress={onMoveUp}
                      style={{ opacity: index === 0 ? 0.2 : 1, padding: 2 }}
                      disabled={index === 0}
                    >
                      <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 16 }}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onMoveDown}
                      style={{ opacity: index === listLength - 1 ? 0.2 : 1, padding: 2 }}
                      disabled={index === listLength - 1}
                    >
                      <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 16 }}>▼</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{item.name}</Text>
                      {item.isDefaultWeekday && <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "600" }}>平日預設</Text></View>}
                      {item.isDefaultHoliday && <View style={{ backgroundColor: "#F0FDF4", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, color: "#16A34A", fontWeight: "600" }}>假日預設</Text></View>}
                    </View>
                    <Text style={{ fontSize: 14, color: "#475569" }}>🕐 {item.startTime} ~ {item.endTime}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={() => openEdit(item as unknown as WorkShift)} style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 13, color: "#475569" }}>編輯</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 13, color: "#EF4444" }}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );

            return (
              <>
                {/* 已分組的班次 - 每個分組獨立排序，互不影響 */}
                {groups.filter(g => g.name.trim()).map(group => {
                  // 依照 group.shiftIds 的順序顯示（保留分組內排序）
                  const groupShifts = group.shiftIds
                    .map(id => localShifts.find(s => s.id === id))
                    .filter((s): s is WorkShift => !!s);
                  if (groupShifts.length === 0) return null;
                  return (
                    <View key={group.id} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{ height: 1, flex: 1, backgroundColor: "#E2E8F0" }} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748B", paddingHorizontal: 4 }}>{group.name}</Text>
                        <View style={{ height: 1, flex: 1, backgroundColor: "#E2E8F0" }} />
                      </View>
                      {groupShifts.map((item, idx) =>
                        renderShiftCard(
                          item,
                          idx,
                          groupShifts.length,
                          () => moveShiftInGroup(group.id, idx, "up", groupShifts),
                          () => moveShiftInGroup(group.id, idx, "down", groupShifts)
                        )
                      )}
                    </View>
                  );
                })}
                {/* 未分組的班次 */}
                {ungroupedShifts.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    {groups.filter(g => g.name.trim()).length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{ height: 1, flex: 1, backgroundColor: "#E2E8F0" }} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8", paddingHorizontal: 4 }}>未分組</Text>
                        <View style={{ height: 1, flex: 1, backgroundColor: "#E2E8F0" }} />
                      </View>
                    )}
                    {ungroupedShifts.map((item, idx) =>
                      renderShiftCard(
                        item,
                        idx,
                        ungroupedShifts.length,
                        () => moveShift(idx, "up", ungroupedShifts),
                        () => moveShift(idx, "down", ungroupedShifts)
                      )
                    )}
                  </View>
                )}
              </>
            );
          })()}
        </ScrollView>
        </>
      )}

      {/* 分組管理 Modal */}
      <Modal visible={showGroupModal} transparent animationType="slide" onRequestClose={() => setShowGroupModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" as any }}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>管理班次分組</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                <Text style={{ fontSize: 20, color: "#94A3B8" }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
              {groups.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Text style={{ fontSize: 14, color: "#94A3B8" }}>尚未建立任何分組</Text>
                  <Text style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>點擊下方「新增分組」開始建立</Text>
                </View>
              )}
              {groups.map((group) => (
                <View key={group.id} style={{ backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" }}>
                  {/* 分組名稱 */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <TextInput
                      value={group.name}
                      onChangeText={v => updateGroupName(group.id, v)}
                      placeholder="分組名稱（例：內場、外場、PT）"
                      style={{ flex: 1, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#1E293B" }}
                      placeholderTextColor="#94A3B8"
                      returnKeyType="done"
                    />
                    <TouchableOpacity onPress={() => deleteGroup(group.id)} style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ color: "#EF4444", fontSize: 13 }}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                  {/* 班次 checkbox 列表 */}
                  <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 8, fontWeight: "600" }}>選擇屬於此分組的班次：</Text>
                  {localShifts.length === 0 ? (
                    <Text style={{ fontSize: 12, color: "#94A3B8" }}>尚未建立班次</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {localShifts.map(shift => {
                        const checked = group.shiftIds.includes(shift.id);
                        return (
                          <TouchableOpacity
                            key={shift.id}
                            onPress={() => toggleShiftInGroup(group.id, shift.id)}
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
                          >
                            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: checked ? "#2563EB" : "#CBD5E1", backgroundColor: checked ? "#2563EB" : "white", alignItems: "center", justifyContent: "center" }}>
                              {checked && <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>✓</Text>}
                            </View>
                            <Text style={{ fontSize: 14, color: "#1E293B" }}>{shift.name}</Text>
                            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{shift.startTime}~{shift.endTime}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity
                onPress={addGroup}
                style={{ borderWidth: 1.5, borderColor: "#2563EB", borderStyle: "dashed" as any, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ color: "#2563EB", fontWeight: "600", fontSize: 14 }}>+ 新增分組</Text>
              </TouchableOpacity>
            </ScrollView>
            {/* Footer buttons */}
            <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <TouchableOpacity onPress={() => setShowGroupModal(false)} style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: "#64748B", fontWeight: "600" }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveGroups} disabled={groupsSaving} style={{ flex: 1, backgroundColor: groupsSaving ? "#93C5FD" : "#2563EB", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: "white", fontWeight: "600" }}>{groupsSaving ? "儲存中..." : "儲存"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 班次新增/編輯 Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 20 }}>{editId ? "編輯班次" : "新增班次"}</Text>
            {formError ? <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 10, marginBottom: 12 }}><Text style={{ color: "#EF4444", fontSize: 13 }}>{formError}</Text></View> : null}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 }}>班次名稱</Text>
            <TextInput value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="例：早班、晚班" style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1E293B", marginBottom: 20 }} placeholderTextColor="#94A3B8" returnKeyType="done" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 12 }}>班次時間</Text>
            <View style={{ flexDirection: "row", gap: 16, justifyContent: "center", marginBottom: 20 }}>
              <TimePickerWheel label="上班時間" value={form.startTime} onChange={v => setForm(f => ({ ...f, startTime: v }))} />
              <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 20 }}>
                <Text style={{ fontSize: 20, color: "#94A3B8" }}>→</Text>
              </View>
              <TimePickerWheel label="下班時間" value={form.endTime} onChange={v => setForm(f => ({ ...f, endTime: v }))} />
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setForm(f => ({ ...f, isDefaultWeekday: !f.isDefaultWeekday }))} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: form.isDefaultWeekday ? "#EFF6FF" : "#F8FAFC", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: form.isDefaultWeekday ? "#2563EB" : "#E2E8F0" }}>
                <Text style={{ fontSize: 16 }}>{form.isDefaultWeekday ? "☑" : "☐"}</Text>
                <Text style={{ fontSize: 13, color: form.isDefaultWeekday ? "#2563EB" : "#64748B", fontWeight: "600" }}>平日預設</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setForm(f => ({ ...f, isDefaultHoliday: !f.isDefaultHoliday }))} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: form.isDefaultHoliday ? "#F0FDF4" : "#F8FAFC", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: form.isDefaultHoliday ? "#16A34A" : "#E2E8F0" }}>
                <Text style={{ fontSize: 16 }}>{form.isDefaultHoliday ? "☑" : "☐"}</Text>
                <Text style={{ fontSize: 13, color: form.isDefaultHoliday ? "#16A34A" : "#64748B", fontWeight: "600" }}>假日預設</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={{ flex: 1, backgroundColor: "#F1F5F9", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: "#64748B", fontWeight: "600" }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={{ flex: 1, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                <Text style={{ color: "white", fontWeight: "600" }}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function ScheduleScreen() {
  const [activeTab, setActiveTab] = useState<TabType>("週排班");

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="排班管理" subtitle="週排班 · 月總覽 · 工作時段" />

      {/* Tab Bar */}
      <View style={{ flexDirection: "row", backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === tab ? "#2563EB" : "transparent" }}
          >
            <Text style={{ fontSize: 14, fontWeight: activeTab === tab ? "700" : "400", color: activeTab === tab ? "#2563EB" : "#94A3B8" }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={{ flex: 1 }}>
        {activeTab === "週排班" && <WeekTab />}
        {activeTab === "月總覽" && <MonthTab />}
        {activeTab === "工作時段" && <WorkShiftsTab />}
      </View>
    </ScreenContainer>
  );
}
