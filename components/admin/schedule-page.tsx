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
  const [staffingSelectedDate, setStaffingSelectedDate] = useState<string>(() => toDateStr(new Date()));
  // 月排班 Modal
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [monthModalEmployee, setMonthModalEmployee] = useState<{ id: number; fullName: string } | null>(null);
  const [monthModalYear, setMonthModalYear] = useState(() => new Date().getFullYear());
  const [monthModalMonth, setMonthModalMonth] = useState(() => new Date().getMonth());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [monthScheduleMap, setMonthScheduleMap] = useState<Record<string, ShiftEntry[]>>({});
  const [monthDayOffSet, setMonthDayOffSet] = useState<Set<string>>(new Set());
  const [monthSaving, setMonthSaving] = useState(false);
  const [monthAlertMsg, setMonthAlertMsg] = useState<{ title: string; message: string } | null>(null);

  // 載入整月排班資料
  const { data: employeeMonthData } = trpc.schedules.getEmployeeMonth.useQuery(
    { employeeId: monthModalEmployee?.id ?? 0, year: monthModalYear, month: monthModalMonth },
    { enabled: !!monthModalEmployee && showMonthModal }
  );
  // 當整月資料載入後，更新 monthScheduleMap 和 monthDayOffSet
  React.useEffect(() => {
    if (!employeeMonthData || !showMonthModal) return;
    const map: Record<string, ShiftEntry[]> = {};
    const offSet = new Set<string>();
    for (const s of employeeMonthData as any[]) {
      const rawDate = s.date as unknown as string | Date;
      const dateKey = typeof rawDate === "string" ? rawDate.split("T")[0] : toDateStr(rawDate);
      if (s.shifts && (s.shifts as any[]).length > 0) {
        map[dateKey] = s.shifts as ShiftEntry[];
      }
      if (s.leaveType === "other" && s.leaveMode === "allDay") {
        offSet.add(dateKey);
      }
    }
    setMonthScheduleMap(map);
    setMonthDayOffSet(offSet);
  }, [employeeMonthData, showMonthModal]);

  const { data: employees } = trpc.employees.list.useQuery();
  const { data: workShifts } = trpc.workShifts.list.useQuery();
  const weekDates = getWeekDates(weekOffset);
  const startDate = toDateStr(weekDates[0]);
  const endDate = toDateStr(weekDates[6]);
  const todayStr = toDateStr(new Date());
  const { data: weekSchedules, refetch: refetchSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });
  const { data: weekSettingsData } = trpc.settings.getAll.useQuery();

  const handlePrint = () => {
    if (Platform.OS !== "web") return;
    const dateRange = `${weekDates[0].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} – ${weekDates[6].toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}`;
    const year = weekDates[0].getFullYear();
    const WEEKDAY_LABELS_CSV = ["日", "一", "二", "三", "四", "五", "六"];
    const LEAVE_LABEL_CSV: Record<string, string> = { annual: "特休", sick: "病假", personal: "事假", marriage: "婚假", bereavement: "喪假", official: "公假", other: "假" };
    const headers = ["員工", ...weekDates.map(d => WEEKDAY_LABELS_CSV[d.getDay()] + " " + (d.getMonth()+1) + "/" + d.getDate())];
    const rows = activeEmployees.map(emp => {
      const cells = weekDates.map(d => {
        const dateStr = toDateStr(d);
        const schedule = scheduleMap[emp.id]?.[dateStr];
        if (schedule?.leaveType && schedule.leaveMode === "allDay") return LEAVE_LABEL_CSV[schedule.leaveType] ?? "假";
        if (schedule?.shifts?.length) return schedule.shifts.map((sh: any) => sh.startTime + "-" + sh.endTime).join(" / ");
        return "";
      });
      return [emp.fullName, ...cells];
    });
    let csv = "\uFEFF" + headers.join(",") + "\n";
    rows.forEach(r => { csv += r.map(v => `"${v.replace(/"/g, '""')}"`).join(",") + "\n"; });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `週排班表_${year}_${dateRange.replace(/\s/g, "")}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
  const batchUpsertMutation = trpc.schedules.batchUpsert.useMutation({
    onSuccess: () => {
      refetchSchedules();
      invalidateSchedules();
      setMonthSaving(false);
      setShowMonthModal(false);
      setMonthAlertMsg({ title: "成功", message: "月排班已儲存！" });
    },
    onError: (err) => { setMonthSaving(false); setMonthAlertMsg({ title: "錯誤", message: err.message }); },
  });

  // 開啟月排班 Modal
  const handleOpenMonthModal = (emp: { id: number; fullName: string }) => {
    setMonthModalEmployee(emp);
    const now = new Date();
    setMonthModalYear(now.getFullYear());
    setMonthModalMonth(now.getMonth());
    setSelectedDates(new Set());
    setMonthScheduleMap({});
    setShowMonthModal(true);
  };

  // 月排班儲存
  const handleSaveMonthSchedule = () => {
    if (!monthModalEmployee) return;
    const shiftEntries = Object.entries(monthScheduleMap)
      .filter(([, shifts]) => shifts && shifts.length > 0)
      .map(([date, shifts]) => ({ date, shifts, leaveType: null, leaveMode: null, leaveStart: null, leaveEnd: null, leaveDuration: null }));
    const dayOffEntries = Array.from(monthDayOffSet)
      .filter(date => !monthScheduleMap[date]?.length) // 排休日不能有班次
      .map(date => ({ date, shifts: [], leaveType: "other" as const, leaveMode: "allDay" as const, leaveStart: null, leaveEnd: null, leaveDuration: 8 }));
    const entries = [...shiftEntries, ...dayOffEntries];
    if (entries.length === 0) {
      setMonthAlertMsg({ title: "提示", message: "尚未設定任何班次或排休" });
      return;
    }
    setMonthSaving(true);
    batchUpsertMutation.mutate({ employeeId: monthModalEmployee.id, entries });
  };

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
  // 依 category（indoor/outdoor/pt）分開計算每天每30分鐘時段的在班人數
  // slot = 分鐘數 / 30，動態計算最早到最晚的時間範圍

  // 分類定義（依員工 tag 欄位）
  const STAFFING_CATEGORIES = [
    { key: "indoor" as const, label: "內場", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE", heatColors: ["#F3F4F6", "#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8"] },
    { key: "outdoor" as const, label: "外場", color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0", heatColors: ["#F3F4F6", "#DCFCE7", "#86EFAC", "#4ADE80", "#16A34A"] },
    { key: "supervisor" as const, label: "幹部", color: "#C2410C", bg: "#FFF7ED", border: "#FED7AA", heatColors: ["#F3F4F6", "#FFEDD5", "#FDBA74", "#FB923C", "#EA580C"] },
    { key: "pt" as const, label: "PT", color: "#D97706", bg: "#FEF3C7", border: "#FDE68A", heatColors: ["#F3F4F6", "#FEF3C7", "#FCD34D", "#F59E0B", "#D97706"] },
  ];

  // 動態計算選定日期的最早開始和最晚結束時間
  const { dynSlotStart, dynSlotEnd } = useMemo(() => {
    let minMin = 10 * 60; // 預設 10:00
    let maxMin = 23 * 60; // 預設 23:00
    for (const emp of activeEmployees) {
      for (const d of weekDates) {
        const dateStr = toDateStr(d);
        const schedule = scheduleMap[emp.id]?.[dateStr];
        if (!schedule?.shifts?.length) continue;
        if (schedule.leaveType && schedule.leaveMode === "allDay") continue;
        for (const shift of schedule.shifts) {
          const [sh, sm] = shift.startTime.split(":").map(Number);
          const [eh, em] = shift.endTime.split(":").map(Number);
          const sMin = sh * 60 + sm;
          let eMin = eh * 60 + em;
          if (eMin <= sMin) eMin += 24 * 60; // 跨日班次修正
          if (sMin < minMin) minMin = sMin;
          if (eMin > maxMin) maxMin = eMin;
        }
      }
    }
    const start = Math.floor(minMin / 30);
    const end = Math.ceil(maxMin / 30);
    return { dynSlotStart: start, dynSlotEnd: end };
  }, [weekSchedules, activeEmployees, weekDates, scheduleMap]);

  const SLOT_START = dynSlotStart;
  const SLOT_END = dynSlotEnd;
  const SLOTS = Array.from({ length: SLOT_END - SLOT_START }, (_, i) => SLOT_START + i);

  // 按員工 tag 分開計算每天每時段人力
  const staffingByCategory = useMemo(() => {
    const catKeys = ["indoor", "outdoor", "supervisor", "pt"];
    const result: Record<string, Record<string, Record<number, string[]>>> = {};
    for (const cat of catKeys) {
      result[cat] = {};
      for (const d of weekDates) {
        const dateStr = toDateStr(d);
        result[cat][dateStr] = {};
        for (let s = SLOT_START; s < SLOT_END; s++) result[cat][dateStr][s] = [];
      }
    }
    for (const emp of activeEmployees) {
      // 用員工 tag 決定分類，預設 indoor
      const empTag = (emp as any).tag ?? "indoor";
      const cat = catKeys.includes(empTag) ? empTag : "indoor";
      for (const d of weekDates) {
        const dateStr = toDateStr(d);
        const schedule = scheduleMap[emp.id]?.[dateStr];
        if (!schedule?.shifts?.length) continue;
        if (schedule.leaveType && schedule.leaveMode === "allDay") continue;
        for (const shift of schedule.shifts) {
          const [sh, sm] = shift.startTime.split(":").map(Number);
          const [eh, em] = shift.endTime.split(":").map(Number);
          const startMin = sh * 60 + sm;
          let endMin = eh * 60 + em;
          if (endMin <= startMin) endMin += 24 * 60; // 跨日班次修正
          for (let s = SLOT_START; s < SLOT_END; s++) {
            const slotStart = s * 30;
            const slotEnd = (s + 1) * 30;
            if (startMin < slotEnd && endMin > slotStart) {
              if (!result[cat][dateStr][s].includes(emp.fullName))
                result[cat][dateStr][s].push(emp.fullName);
            }
          }
        }
      }
    }
    return result;
  }, [weekSchedules, activeEmployees, weekDates, scheduleMap, SLOT_START, SLOT_END]);

  // 合計所有分類（供 popup 使用）
  const staffingByDayHour = useMemo(() => {
    const catKeys = ["indoor", "outdoor", "supervisor", "pt"];
    const result: Record<string, Record<number, string[]>> = {};
    for (const d of weekDates) {
      const dateStr = toDateStr(d);
      result[dateStr] = {};
      for (let s = SLOT_START; s < SLOT_END; s++) {
        const all = new Set<string>();
        for (const cat of catKeys) {
          for (const name of (staffingByCategory[cat]?.[dateStr]?.[s] ?? [])) all.add(name);
        }
        result[dateStr][s] = Array.from(all);
      }
    }
    return result;
  }, [staffingByCategory, weekDates, SLOT_START, SLOT_END]);

  const maxStaff = useMemo(() => {
    let max = 1;
    for (const catData of Object.values(staffingByCategory))
      for (const dayData of Object.values(catData))
        for (const names of Object.values(dayData))
          if (names.length > max) max = names.length;
    return max;
  }, [staffingByCategory]);

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
              <Text style={{ fontSize: 13, color: "white", fontWeight: "600" }}>⬇️ 下載 Excel</Text>
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
          style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: showStaffingView ? 8 : 12 }}
        >
          {/* Title row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>⏱ 時段人力視圖</Text>
              <View style={{ backgroundColor: "#EFF6FF", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>每小時在班人數</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: "#2563EB", fontWeight: "600" }}>{showStaffingView ? "收起 ▲" : "展開 ▼"}</Text>
          </View>
          {/* 當天人員分類統計 */}
          {(() => {
            const todayScheduled = activeEmployees.filter(emp => {
              const schedule = scheduleMap[emp.id]?.[todayStr];
              if (!schedule?.shifts?.length) return false;
              if (schedule.leaveType && schedule.leaveMode === "allDay") return false;
              return true;
            });
            const indoorCount = todayScheduled.filter(e => (e as any).tag === "indoor").length;
            const outdoorCount = todayScheduled.filter(e => (e as any).tag === "outdoor").length;
            const supervisorCount = todayScheduled.filter(e => (e as any).tag === "supervisor").length;
            const ptCount = todayScheduled.filter(e => !(e as any).tag).length;
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: "#475569", fontWeight: "600" }}>今日在班</Text>
                  <Text style={{ fontSize: 15, color: "#1E293B", fontWeight: "700" }}>{todayScheduled.length}</Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8" }}>人</Text>
                </View>
                <View style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: "#1D4ED8", fontWeight: "600" }}>內場</Text>
                  <Text style={{ fontSize: 15, color: "#1D4ED8", fontWeight: "700" }}>{indoorCount}</Text>
                </View>
                <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: "#15803D", fontWeight: "600" }}>外場</Text>
                  <Text style={{ fontSize: 15, color: "#15803D", fontWeight: "700" }}>{outdoorCount}</Text>
                </View>
                <View style={{ backgroundColor: "#FFF7ED", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: "#C2410C", fontWeight: "600" }}>幹部</Text>
                  <Text style={{ fontSize: 15, color: "#C2410C", fontWeight: "700" }}>{supervisorCount}</Text>
                </View>
                {ptCount > 0 && (
                  <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 11, color: "#D97706", fontWeight: "600" }}>PT</Text>
                    <Text style={{ fontSize: 15, color: "#D97706", fontWeight: "700" }}>{ptCount}</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </TouchableOpacity>

        {showStaffingView && (() => {
          const COL_W = 30;
          const ROW_H = 34;
          const LABEL_W = 44;
          const slotToTime = (s: number) => {
            const totalMin = s * 30;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            return `${h}:${m === 0 ? "00" : "30"}`;
          };
          // 確保選定日期在本週範圍內
          const validSelectedDate = weekDates.some(d => toDateStr(d) === staffingSelectedDate)
            ? staffingSelectedDate
            : todayStr;
          const selDate = new Date(validSelectedDate + "T00:00:00");
          const selIsWeekend = selDate.getDay() === 0 || selDate.getDay() === 6;

          return (
            <View style={{ paddingBottom: 12 }}>
              {/* 日期選擇列 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                  {weekDates.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === validSelectedDate;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const dayLabel = ["日","一","二","三","四","五","六"][d.getDay()];
                    // 計算當天在班人數
                    const dayTotal = staffingByDayHour[dateStr]
                      ? Object.values(staffingByDayHour[dateStr]).reduce((max, names) => Math.max(max, names.length), 0)
                      : 0;
                    return (
                      <TouchableOpacity
                        key={di}
                        onPress={() => { setStaffingSelectedDate(dateStr); setStaffingPopup(null); }}
                        style={{
                          alignItems: "center",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 10,
                          backgroundColor: isSelected ? "#1E293B" : isToday ? "#EFF6FF" : "#F8FAFC",
                          borderWidth: isToday && !isSelected ? 1.5 : 0,
                          borderColor: "#2563EB",
                          minWidth: 48,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "600", color: isSelected ? "#94A3B8" : isWeekend ? "#94A3B8" : "#64748B" }}>
                          {isToday ? "今" : `週${dayLabel}`}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: isSelected ? "white" : isWeekend ? "#94A3B8" : "#1E293B", marginTop: 1 }}>
                          {d.getDate()}
                        </Text>
                        {dayTotal > 0 && (
                          <View style={{ backgroundColor: isSelected ? "#475569" : "#E2E8F0", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 }}>
                            <Text style={{ fontSize: 9, color: isSelected ? "white" : "#64748B", fontWeight: "600" }}>{dayTotal}人</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Popup panel */}
              {staffingPopup && staffingPopup.dateStr === validSelectedDate && (() => {
                const slotMin = staffingPopup.slot * 30;
                const endMin = slotMin + 30;
                const startLabel = slotToTime(staffingPopup.slot);
                const endH = Math.floor(endMin / 60);
                const endM = endMin % 60;
                const endLabel = `${endH}:${endM === 0 ? "00" : "30"}`;
                const popupCatNames: Record<string, string[]> = { indoor: [], outdoor: [], supervisor: [], pt: [] };
                for (const name of staffingPopup.names) {
                  for (const cat of ["indoor", "outdoor", "supervisor", "pt"]) {
                    if ((staffingByCategory[cat]?.[staffingPopup.dateStr]?.[staffingPopup.slot] ?? []).includes(name)) {
                      popupCatNames[cat].push(name);
                    }
                  }
                }
                return (
                  <View style={{ marginHorizontal: 12, marginBottom: 10, backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: "#1E293B", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>{startLabel}–{endLabel}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B" }}>{staffingPopup.names.length} 人在班</Text>
                      </View>
                      <TouchableOpacity onPress={() => setStaffingPopup(null)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 13, color: "#475569", fontWeight: "700" }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {staffingPopup.names.length === 0 ? (
                      <Text style={{ fontSize: 13, color: "#94A3B8" }}>此時段無人排班</Text>
                    ) : (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                        {STAFFING_CATEGORIES.map(cat => {
                          const names = popupCatNames[cat.key] ?? [];
                          if (names.length === 0) return null;
                          return (
                            <View key={cat.key} style={{ minWidth: 80 }}>
                              <Text style={{ fontSize: 10, color: cat.color, fontWeight: "700", marginBottom: 4 }}>{cat.label} {names.length}人</Text>
                              <View style={{ gap: 3 }}>
                                {names.map((name, i) => (
                                  <View key={i} style={{ backgroundColor: cat.bg, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: cat.border }}>
                                    <Text style={{ fontSize: 11, color: cat.color, fontWeight: "600" }}>{name}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Grid - 只顯示選定日期 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={{ paddingHorizontal: 12 }}>
                  {/* Time header */}
                  <View style={{ flexDirection: "row", marginBottom: 2 }}>
                    <View style={{ width: LABEL_W }} />
                    {SLOTS.map(s => {
                      const totalMin = s * 30;
                      const h = Math.floor(totalMin / 60);
                      const m = totalMin % 60;
                      return (
                        <View key={s} style={{ width: COL_W, height: 18, alignItems: "center", justifyContent: "flex-end" }}>
                          {m === 0 && <Text style={{ fontSize: 9, fontWeight: "700", color: "#374151" }}>{h}時</Text>}
                        </View>
                      );
                    })}
                  </View>

                  {/* 四個分類各一列 */}
                  {STAFFING_CATEGORIES.map((cat, ci) => {
                    // 檢查此分類是否有任何人排班
                    const hasAny = SLOTS.some(s => (staffingByCategory[cat.key]?.[validSelectedDate]?.[s]?.length ?? 0) > 0);
                    return (
                      <View key={cat.key} style={{ flexDirection: "row", marginBottom: ci < STAFFING_CATEGORIES.length - 1 ? 3 : 0 }}>
                        {/* 分類標籤 */}
                        <View style={{ width: LABEL_W, height: ROW_H, justifyContent: "center", alignItems: "flex-end", paddingRight: 6 }}>
                          <View style={{ backgroundColor: hasAny ? cat.bg : "#F3F4F6", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: hasAny ? cat.border : "#E5E7EB" }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: hasAny ? cat.color : "#CBD5E1" }}>{cat.label}</Text>
                          </View>
                        </View>
                        {/* Slot cells */}
                        {SLOTS.map(s => {
                          const names = staffingByCategory[cat.key]?.[validSelectedDate]?.[s] ?? [];
                          const count = names.length;
                          const isActive = staffingPopup?.dateStr === validSelectedDate && staffingPopup?.slot === s;
                          const m = (s * 30) % 60;
                          const heatColors = cat.heatColors;
                          const bg = isActive ? cat.color
                            : count === 0 ? (selIsWeekend ? "#F9FAFB" : "#F3F4F6")
                            : count === 1 ? heatColors[1]
                            : count <= 3 ? heatColors[2]
                            : count <= 5 ? heatColors[3]
                            : heatColors[4];
                          const textColor = isActive || count > 5 ? "white" : count > 0 ? cat.color : "transparent";
                          return (
                            <TouchableOpacity
                              key={s}
                              onPress={() => {
                                const allNames = staffingByDayHour[validSelectedDate]?.[s] ?? [];
                                setStaffingPopup(isActive ? null : { dateStr: validSelectedDate, slot: s, names: allNames });
                              }}
                              style={{
                                width: COL_W, height: ROW_H,
                                backgroundColor: bg,
                                borderRadius: 3,
                                marginHorizontal: 0.5,
                                alignItems: "center", justifyContent: "center",
                                borderLeftWidth: m === 30 ? 1 : 0,
                                borderLeftColor: "#E5E7EB",
                                borderWidth: isActive ? 1.5 : 0,
                                borderColor: cat.color,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "700", color: textColor }}>{count > 0 ? count : ""}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}

                  {/* Legend */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingLeft: LABEL_W, paddingTop: 8, paddingBottom: 2 }}>
                    {STAFFING_CATEGORIES.map(cat => (
                      <View key={cat.key} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: cat.color }} />
                        <Text style={{ fontSize: 9, color: cat.color, fontWeight: "700" }}>{cat.label}</Text>
                      </View>
                    ))}
                    <Text style={{ fontSize: 9, color: "#9CA3AF" }}>點擊格子查看詳細</Text>
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
            <TouchableOpacity
              onPress={() => handleOpenMonthModal(emp)}
              style={{ width: 60, paddingLeft: 10, justifyContent: "center", alignItems: "flex-start" }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>{emp.fullName[0]}</Text>
              </View>
              <Text style={{ fontSize: 9, fontWeight: "600", color: "#1E293B" }} numberOfLines={2}>{emp.fullName}</Text>
              <View style={{ backgroundColor: "#DBEAFE", borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginTop: 3 }}>
                <Text style={{ fontSize: 8, color: "#2563EB", fontWeight: "700" }}>月排班</Text>
              </View>
            </TouchableOpacity>
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
              {/* 依班次 category 分組顯示快速套用按鈕 */}
              {(() => {
                const activeShifts = (workShifts ?? []).filter(ws => ws.isActive);
                const CATEGORY_ORDER = [
                  { key: "indoor", label: "內場", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
                  { key: "outdoor", label: "外場", color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
                  { key: "pt", label: "其他", color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
                ];
                const renderShiftBtn = (ws: typeof activeShifts[0]) => {
                  const cat = CATEGORY_ORDER.find(c => c.key === (ws as any).category) ?? CATEGORY_ORDER[2];
                  return (
                    <TouchableOpacity
                      key={ws.id}
                      onPress={() => {
                        setLeave(p => ({ ...p, enabled: false }));
                        setShifts(prev => [...prev, { startTime: ws.startTime, endTime: ws.endTime, label: ws.name }]);
                      }}
                      style={{ backgroundColor: cat.bg, borderWidth: 1, borderColor: cat.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: cat.color }}>{ws.name}</Text>
                      <Text style={{ fontSize: 11, color: cat.color, opacity: 0.7, marginTop: 2 }}>{ws.startTime} ~ {ws.endTime}</Text>
                    </TouchableOpacity>
                  );
                };
                return (
                  <>
                    {CATEGORY_ORDER.map(cat => {
                      const catShifts = activeShifts.filter(ws => ((ws as any).category ?? "indoor") === cat.key);
                      if (catShifts.length === 0) return null;
                      return (
                        <View key={cat.key} style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: cat.color, fontWeight: "700", marginBottom: 6 }}>{cat.label}</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {catShifts.map(renderShiftBtn)}
                            </View>
                          </ScrollView>
                        </View>
                      );
                    })}
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

      {/* 月排班 Modal */}
      <Modal visible={showMonthModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "white" }}>
            <TouchableOpacity onPress={() => setShowMonthModal(false)}>
              <Text style={{ color: "#64748B", fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>{monthModalEmployee?.fullName} 月排班</Text>
              <Text style={{ fontSize: 12, color: "#64748B" }}>{monthModalYear}年{monthModalMonth + 1}月</Text>
            </View>
            <TouchableOpacity onPress={handleSaveMonthSchedule} disabled={monthSaving}>
              {monthSaving ? <ActivityIndicator size="small" color="#2563EB" /> : <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>儲存</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* 月份切換 */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => { setSelectedDates(new Set()); setMonthScheduleMap({}); if (monthModalMonth === 0) { setMonthModalYear(y => y - 1); setMonthModalMonth(11); } else setMonthModalMonth(m => m - 1); }}
                style={{ padding: 8, backgroundColor: "white", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}
              >
                <Text style={{ fontSize: 16, color: "#2563EB" }}>❮</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>{monthModalYear}年{monthModalMonth + 1}月</Text>
              <TouchableOpacity
                onPress={() => { setSelectedDates(new Set()); setMonthScheduleMap({}); if (monthModalMonth === 11) { setMonthModalYear(y => y + 1); setMonthModalMonth(0); } else setMonthModalMonth(m => m + 1); }}
                style={{ padding: 8, backgroundColor: "white", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}
              >
                <Text style={{ fontSize: 16, color: "#2563EB" }}>❯</Text>
              </TouchableOpacity>
            </View>

            {/* 工作時段快選 - 依 category 分組 */}
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 6 }}>選擇日期後套用班次</Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>先點選下方月曆的日期，再點班次套用（可多選班次，點已選的班次可取消）</Text>
              {(() => {
                const activeShifts = (workShifts ?? []).filter(ws => ws.isActive);
                const CATEGORY_ORDER = [
                  { key: "indoor", label: "內場", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
                  { key: "outdoor", label: "外場", color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
                  { key: "pt", label: "其他", color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
                ];
                return (
                  <>
                    {CATEGORY_ORDER.map(cat => {
                      const catShifts = activeShifts.filter(ws => ((ws as any).category ?? "indoor") === cat.key);
                      if (catShifts.length === 0) return null;
                      return (
                        <View key={cat.key} style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: cat.color, fontWeight: "700", marginBottom: 6 }}>{cat.label}</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {catShifts.map(ws => (
                                <TouchableOpacity
                                  key={ws.id}
                                  onPress={() => {
                                    if (selectedDates.size === 0) {
                                      setMonthAlertMsg({ title: "提示", message: "請先點選月曆上的日期" });
                                      return;
                                    }
                                    const newShift = { startTime: ws.startTime, endTime: ws.endTime, label: ws.name };
                                    const newMap = { ...monthScheduleMap };
                                    selectedDates.forEach(dateStr => {
                                      const existing = newMap[dateStr] ?? [];
                                      const alreadyIdx = existing.findIndex(s => s.label === ws.name && s.startTime === ws.startTime && s.endTime === ws.endTime);
                                      if (alreadyIdx >= 0) {
                                        // 已有此班次 → 移除（切換取消）
                                        newMap[dateStr] = existing.filter((_, i) => i !== alreadyIdx);
                                      } else {
                                        // 新增班次（累加，支援兩段班）
                                        newMap[dateStr] = [...existing, newShift];
                                      }
                                    });
                                    setMonthScheduleMap(newMap);
                                    // 不清除 selectedDates，讓管理員可以繼續加其他班次
                                  }}
                                  style={(() => {
                                    // 判斷目前選取的日期中，是否有任何一天已套用此班次
                                    const anyApplied = selectedDates.size > 0 && [...selectedDates].some(d => (monthScheduleMap[d] ?? []).some(s => s.label === ws.name && s.startTime === ws.startTime && s.endTime === ws.endTime));
                                    return { backgroundColor: anyApplied ? cat.color : cat.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: cat.border };
                                  })()}
                                >
                                  {(() => {
                                    const anyApplied = selectedDates.size > 0 && [...selectedDates].some(d => (monthScheduleMap[d] ?? []).some(s => s.label === ws.name && s.startTime === ws.startTime && s.endTime === ws.endTime));
                                    return (
                                      <>
                                        <Text style={{ fontSize: 12, fontWeight: "700", color: anyApplied ? "white" : cat.color }}>{anyApplied ? "✓ " : ""}{ws.name}</Text>
                                        <Text style={{ fontSize: 11, color: anyApplied ? "rgba(255,255,255,0.8)" : cat.color, opacity: anyApplied ? 1 : 0.7 }}>{ws.startTime}-{ws.endTime}</Text>
                                      </>
                                    );
                                  })()}
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      );
                    })}
                    {/* 排休按鈕 */}
                    <TouchableOpacity
                      onPress={() => {
                        if (selectedDates.size === 0) {
                          setMonthAlertMsg({ title: "提示", message: "請先點選月曆上的日期" });
                          return;
                        }
                        // 排休日期：清除班次，加入 dayOffSet
                        const newMap = { ...monthScheduleMap };
                        const newOffSet = new Set(monthDayOffSet);
                        selectedDates.forEach(dateStr => {
                          delete newMap[dateStr];
                          newOffSet.add(dateStr);
                        });
                        setMonthScheduleMap(newMap);
                        setMonthDayOffSet(newOffSet);
                        setSelectedDates(new Set());
                      }}
                      style={{ backgroundColor: "#F0FDF4", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#86EFAC", alignSelf: "flex-start", marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#16A34A" }}>✓ 設為排休</Text>
                    </TouchableOpacity>
                    {/* 清除選取日期班次按鈕 */}
                    <TouchableOpacity
                      onPress={() => {
                        if (selectedDates.size === 0) {
                          setMonthAlertMsg({ title: "提示", message: "請先點選月曆上的日期" });
                          return;
                        }
                        const newMap = { ...monthScheduleMap };
                        const newOffSet = new Set(monthDayOffSet);
                        selectedDates.forEach(dateStr => {
                          delete newMap[dateStr];
                          newOffSet.delete(dateStr); // 一併清除排休
                        });
                        setMonthScheduleMap(newMap);
                        setMonthDayOffSet(newOffSet);
                        setSelectedDates(new Set());
                      }}
                      style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#FECACA", alignSelf: "flex-start", marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>清除選取日期班次</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>

            {/* 月曆 */}
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
              {/* 星期標題 */}
              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: i === 0 || i === 6 ? "#EF4444" : "#64748B" }}>{d}</Text>
                  </View>
                ))}
              </View>
              {/* 日期格子 */}
              {(() => {
                const firstDay = new Date(monthModalYear, monthModalMonth, 1).getDay();
                const daysInMonth = new Date(monthModalYear, monthModalMonth + 1, 0).getDate();
                const cells: React.ReactElement[] = [];
                let dayCount = 1;
                for (let row = 0; row < 6; row++) {
                  if (dayCount > daysInMonth) break;
                  const rowCells: React.ReactElement[] = [];
                  for (let col = 0; col < 7; col++) {
                    const cellIndex = row * 7 + col;
                    if (cellIndex < firstDay || dayCount > daysInMonth) {
                      rowCells.push(<View key={col} style={{ flex: 1 }} />);
                    } else {
                      const d = dayCount;
                      const dateStr = `${monthModalYear}-${String(monthModalMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      const isSelected = selectedDates.has(dateStr);
                      const hasSchedule = !!monthScheduleMap[dateStr]?.length;
                      const isDayOff = monthDayOffSet.has(dateStr) && !hasSchedule;
                      const isWeekend = col === 0 || col === 6;
                      const isToday = dateStr === toDateStr(new Date());
                      rowCells.push(
                        <TouchableOpacity
                          key={col}
                          onPress={() => {
                            const newSelected = new Set(selectedDates);
                            if (newSelected.has(dateStr)) newSelected.delete(dateStr);
                            else newSelected.add(dateStr);
                            setSelectedDates(newSelected);
                          }}
                          style={{
                            flex: 1, minHeight: 52, margin: 1, borderRadius: 8,
                            backgroundColor: isSelected ? "#2563EB" : isDayOff ? "#DCFCE7" : hasSchedule ? "#EFF6FF" : isWeekend ? "#FFF7ED" : "#F8FAFC",
                            alignItems: "center", justifyContent: "center", padding: 2,
                            borderWidth: isToday ? 2 : 1,
                            borderColor: isSelected ? "#1D4ED8" : isDayOff ? "#86EFAC" : isToday ? "#2563EB" : "#F1F5F9",
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? "white" : isWeekend ? "#EF4444" : "#1E293B", lineHeight: 18 }}>{d}</Text>
                          {hasSchedule && !isSelected && (
                            <View style={{ alignItems: "center" }}>
                              {monthScheduleMap[dateStr].slice(0, 1).map((sh, si) => (
                                <Text key={si} style={{ fontSize: 8, color: "#2563EB", lineHeight: 11 }}>{sh.startTime}</Text>
                              ))}
                            </View>
                          )}
                          {isDayOff && !isSelected && (
                            <Text style={{ fontSize: 9, color: "#16A34A", fontWeight: "700", lineHeight: 12 }}>休</Text>
                          )}
                          {isSelected && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "white", marginTop: 2 }} />}
                        </TouchableOpacity>
                      );
                      dayCount++;
                    }
                  }
                  cells.push(<View key={row} style={{ flexDirection: "row", marginBottom: 2 }}>{rowCells}</View>);
                }
                return cells;
              })()}
            </View>

            {/* 已選日期提示 */}
            {selectedDates.size > 0 && (
              <View style={{ backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 13, color: "#2563EB", fontWeight: "600", flex: 1 }}>已選 {selectedDates.size} 天，點上方班次套用或設為排休</Text>
                <TouchableOpacity onPress={() => setSelectedDates(new Set())}>
                  <Text style={{ fontSize: 12, color: "#64748B" }}>取消選取</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 快速操作 */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  const daysInMonth = new Date(monthModalYear, monthModalMonth + 1, 0).getDate();
                  const newSelected = new Set<string>();
                  for (let d = 1; d <= daysInMonth; d++) {
                    const date = new Date(monthModalYear, monthModalMonth, d);
                    if (date.getDay() !== 0 && date.getDay() !== 6) {
                      newSelected.add(`${monthModalYear}-${String(monthModalMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
                    }
                  }
                  setSelectedDates(newSelected);
                }}
                style={{ flex: 1, backgroundColor: "white", borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#1E293B" }}>選全部工作日</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const daysInMonth = new Date(monthModalYear, monthModalMonth + 1, 0).getDate();
                  const newSelected = new Set<string>();
                  for (let d = 1; d <= daysInMonth; d++) {
                    newSelected.add(`${monthModalYear}-${String(monthModalMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
                  }
                  setSelectedDates(newSelected);
                }}
                style={{ flex: 1, backgroundColor: "white", borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#1E293B" }}>選整月</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setMonthScheduleMap({});
                  setSelectedDates(new Set());
                }}
                style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#FECACA" }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#EF4444" }}>清空整月</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        {/* 月排班 Alert */}
        {monthAlertMsg && (
          <Modal visible animationType="fade" transparent>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" }}>
              <View style={{ backgroundColor: "white", borderRadius: 16, padding: 24, width: 280, alignItems: "center" }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B", marginBottom: 8 }}>{monthAlertMsg.title}</Text>
                <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 20 }}>{monthAlertMsg.message}</Text>
                <TouchableOpacity onPress={() => setMonthAlertMsg(null)} style={{ backgroundColor: "#2563EB", borderRadius: 10, paddingHorizontal: 32, paddingVertical: 10 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>確定</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
  // 日期詳情 Modal
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);

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
    const LEAVE_LABEL_CSV: Record<string, string> = {
      annual: '特休', sick: '病假', personal: '事假',
      marriage: '婚假', bereavement: '喪假', official: '公假', other: '休假',
    };
    const daysCount = getDaysInMonth(year, month);
    const printEmployees = activeEmployees.filter(e => e.fullName !== 'M' && e.fullName !== '系統管理員');
    // 標題列：員工, 1日(日), 2日(一), ...
    const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    const headers = ['員工', ...Array.from({ length: daysCount }, (_, i) => {
      const d = i + 1;
      const dow = new Date(year, month, d).getDay();
      return `${d}日(${WEEKDAY_LABELS[dow]})`;
    })];
    const rows = printEmployees.map(emp => {
      const cells = Array.from({ length: daysCount }, (_, i) => {
        const d = i + 1;
        const dateStr = fmtDate(year, month, d);
        const dayData = scheduleMap[dateStr]?.[emp.id];
        if (dayData?.leaveType) return LEAVE_LABEL_CSV[dayData.leaveType] ?? '假';
        if (dayData?.shifts?.length) return dayData.shifts.map((sh: ShiftEntry) => sh.startTime + '-' + sh.endTime).join(' / ');
        return '';
      });
      return [emp.fullName, ...cells];
    });
    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(r => { csv += r.map(v => `"${v.replace(/"/g, '""')}"`).join(',') + '\n'; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${year}年${month + 1}月排班表.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrintBlank = () => {
    if (Platform.OS !== 'web') return;
    const daysCount = getDaysInMonth(year, month);
    const printEmployees = activeEmployees.filter(e => e.fullName !== '系統管理員');
    const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    const days = Array.from({ length: daysCount }, (_, i) => {
      const d = i + 1;
      const dow = new Date(year, month, d).getDay();
      return { d, dow, label: WEEKDAY_LABELS[dow], isWeekend: dow === 0 || dow === 6 };
    });
    // A4 橫印，每頁最多 16 天
    const COLS_PER_PAGE = 16;
    const segments: number[][] = [];
    for (let i = 0; i < daysCount; i += COLS_PER_PAGE) {
      segments.push(Array.from({ length: Math.min(COLS_PER_PAGE, daysCount - i) }, (_, j) => i + j));
    }
    const nameColW = 72;
    const dayColW = 40;
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${year}年${month + 1}月 空白班表</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Microsoft JhengHei', 'PingFang TC', Arial, sans-serif; font-size: 11px; margin: 0; }
  h2 { text-align: center; margin: 0 0 4px; font-size: 15px; font-weight: 700; }
  .hint { text-align: center; font-size: 10px; color: #555; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
  th, td { border: 1px solid #aaa; text-align: center; padding: 2px 1px; height: 30px; }
  th { background: #e8f0fe; font-weight: 700; }
  .name-col { width: ${nameColW}px; min-width: ${nameColW}px; text-align: left; padding-left: 6px; font-weight: 600; }
  .day-col { width: ${dayColW}px; min-width: ${dayColW}px; }
  .weekend-h { background: #ffe4e4; color: #c00; }
  .weekend-c { background: #fff5f5; }
  .day-num { font-size: 12px; font-weight: 700; line-height: 1.2; }
  .day-dow { font-size: 9px; line-height: 1.2; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h2>${year} 年 ${month + 1} 月　空白班表（請假申請）</h2>
<p class="hint">請在對應日期格內填寫假別：特休／病假／事假／婚假／喪假／公假／休假</p>
`;
    for (const seg of segments) {
      html += `<table><thead><tr><th class="name-col">姓名</th>`;
      for (const idx of seg) {
        const { d, label, isWeekend } = days[idx];
        html += `<th class="day-col${isWeekend ? ' weekend-h' : ''}">`;
        html += `<div class="day-num">${d}</div><div class="day-dow">${label}</div></th>`;
      }
      html += `</tr></thead><tbody>`;
      for (const emp of printEmployees) {
        html += `<tr><td class="name-col">${emp.fullName}</td>`;
        for (const idx of seg) {
          const { isWeekend } = days[idx];
          html += `<td class="day-col${isWeekend ? ' weekend-c' : ''}"></td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</body></html>`;
    const win = window.open('', '_blank', 'width=1100,height=750');
    if (!win) { alert('請允許流覽器開啟即時視窗'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
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
              <>
                <TouchableOpacity onPress={handlePrintBlank} style={{ backgroundColor: "#059669", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 12, color: "white", fontWeight: "600" }}>🖨️ 空白班表</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleMonthPrint} style={{ backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 12, color: "white", fontWeight: "600" }}>⬇️ 下載 Excel</Text>
                </TouchableOpacity>
              </>
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
                const workingCount = Object.values(daySchedules).filter(s => s.shifts && s.shifts.length > 0 && !s.leaveType).length;
                const leaveCount = Object.values(daySchedules).filter(s => s.leaveType).length;
                const dow = (firstDow + cell.day - 1) % 7;
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => { setDayDetailDate(cell.dateStr!); setSelectedDate(cell.dateStr!); }}
                    style={{ flex: 1, height: 60, alignItems: "center", paddingTop: 6, borderRadius: 8, marginHorizontal: 1, backgroundColor: isSelected ? "#DBEAFE" : "transparent", borderWidth: isSelected ? 1.5 : 0, borderColor: isSelected ? "#2563EB" : "transparent" }}
                  >
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isToday ? "#2563EB" : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 13, fontWeight: isToday || isSelected ? "700" : "400", color: isToday ? "white" : isWeekend ? "#EF4444" : "#1E293B" }}>{cell.day}</Text>
                    </View>
                    {workingCount > 0 && (
                      <View style={{ marginTop: 2, backgroundColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 9, color: "#1D4ED8", fontWeight: "600" }}>{workingCount}人</Text>
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

      {/* Day Detail Modal */}
      <Modal
        visible={dayDetailDate !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDayDetailDate(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* Modal Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, paddingTop: 20, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
            <TouchableOpacity onPress={() => setDayDetailDate(null)}>
              <Text style={{ color: "#64748B", fontSize: 15 }}>關閉</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>
              {dayDetailDate ? (() => {
                const [y, m, d] = dayDetailDate.split("-").map(Number);
                const dow = new Date(y, m - 1, d).getDay();
                return `${m} 月 ${d} 日（${WEEKDAYS[dow]}）`;
              })() : ""}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {dayDetailDate && (() => {
            const daySchedules = scheduleMap[dayDetailDate] ?? {};
            const workingEmps = activeEmployees.filter(e => {
              const d = daySchedules[e.id];
              return d?.shifts?.length > 0 && !d?.leaveType;
            });
            const leaveEmps = activeEmployees.filter(e => daySchedules[e.id]?.leaveType);
            const unscheduledEmps = activeEmployees.filter(e => {
              const d = daySchedules[e.id];
              return !d || (!d.shifts?.length && !d.leaveType);
            });
            return (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
                {/* Summary Cards */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", padding: 14, alignItems: "center" }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#2563EB" }}>{workingEmps.length}</Text>
                    <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>上班人數</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#FECACA", padding: 14, alignItems: "center" }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#DC2626" }}>{leaveEmps.length}</Text>
                    <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>請假人數</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, alignItems: "center" }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#94A3B8" }}>{unscheduledEmps.length}</Text>
                    <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>未排班</Text>
                  </View>
                </View>

                {/* Working Employees */}
                {workingEmps.length > 0 && (
                  <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803D" }}>上班中（{workingEmps.length} 人）</Text>
                    </View>
                    {workingEmps.map((emp, i) => {
                      const d = daySchedules[emp.id];
                      return (
                        <View key={emp.id} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < workingEmps.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#16A34A" }}>{emp.fullName[0]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>{emp.fullName}</Text>
                            <View style={{ marginTop: 3, gap: 2 }}>
                              {d.shifts.map((shift: ShiftEntry, si: number) => (
                                <Text key={si} style={{ fontSize: 12, color: "#475569" }}>
                                  {shift.label ? `${shift.label}  ` : ""}{shift.startTime} – {shift.endTime}
                                </Text>
                              ))}
                            </View>
                          </View>
                          <View style={{ backgroundColor: "#DCFCE7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: "#16A34A" }}>上班</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Leave Employees */}
                {leaveEmps.length > 0 && (
                  <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#DC2626" }}>請假中（{leaveEmps.length} 人）</Text>
                    </View>
                    {leaveEmps.map((emp, i) => {
                      const d = daySchedules[emp.id];
                      const leaveInfo = LEAVE_TYPES.find(lt => lt.value === d.leaveType);
                      return (
                        <View key={emp.id} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < leaveEmps.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: leaveInfo?.bg ?? "#FEF2F2", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: leaveInfo?.color ?? "#DC2626" }}>{emp.fullName[0]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>{emp.fullName}</Text>
                            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                              {leaveInfo?.label ?? "請假"}
                              {d.leaveMode === "partial" && d.leaveDuration ? `（${parseFloat(d.leaveDuration).toFixed(1)} 小時）` : "（整天）"}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: leaveInfo?.bg ?? "#FEF2F2", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: leaveInfo?.color ?? "#DC2626" }}>{leaveInfo?.label ?? "請假"}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Unscheduled Employees */}
                {unscheduledEmps.length > 0 && (
                  <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#94A3B8" }} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748B" }}>未排班（{unscheduledEmps.length} 人）</Text>
                    </View>
                    {unscheduledEmps.map((emp, i) => (
                      <View key={emp.id} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < unscheduledEmps.length - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8" }}>{emp.fullName[0]}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: "#94A3B8" }}>{emp.fullName}</Text>
                        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8" }}>未排班</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {workingEmps.length === 0 && leaveEmps.length === 0 && (
                  <View style={{ paddingVertical: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, color: "#94A3B8" }}>本日尚無任何排班資料</Text>
                  </View>
                )}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>

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
