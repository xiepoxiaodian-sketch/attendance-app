import { useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, FlatList, TextInput, Switch, RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { TimePickerWheel } from "@/components/time-picker-wheel";
import { ConfirmDialog, AlertDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

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
  { value: "other",    label: "其他", color: "#64748B", bg: "#F1F5F9" },
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

  const weekDates = getWeekDates(weekOffset);
  const startDate = toDateStr(weekDates[0]);
  const endDate = toDateStr(weekDates[6]);
  const todayStr = toDateStr(new Date());

  const { data: employees } = trpc.employees.list.useQuery();
  const { data: workShifts } = trpc.workShifts.list.useQuery();
  const { data: weekSchedules, refetch: refetchSchedules } = trpc.schedules.getWeekAll.useQuery({ startDate, endDate });

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
    if (!existing) { setShowModal(false); return; }
    setConfirmDeleteSchedule(true);
  };

  const handleConfirmDeleteSchedule = () => {
    if (!selectedEmployee || !selectedDate) return;
    const existing = scheduleMap[selectedEmployee]?.[selectedDate];
    if (existing) deleteMutation.mutate({ id: existing.id });
    setConfirmDeleteSchedule(false);
  };

  const addShift = () => setShifts(prev => [...prev, { startTime: "09:00", endTime: "18:00", label: `班次${prev.length + 1}` }]);
  const removeShift = (i: number) => setShifts(prev => prev.filter((_, idx) => idx !== i));
  const updateShift = (i: number, field: string, value: string) => setShifts(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const leaveDuration = leave.mode === "allDay" ? 8 : calcDuration(leave.start, leave.end);

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
                    <Text style={{ fontSize: 9, color: "#CBD5E1" }}>{isWeekend ? "休" : "—"}</Text>
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
            {(workShifts ?? []).filter(ws => ws.isActive).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8", marginBottom: 8 }}>快速套用</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(workShifts ?? []).filter(ws => ws.isActive).map(ws => (
                      <TouchableOpacity key={ws.id} onPress={() => setShifts([{ startTime: ws.startTime, endTime: ws.endTime, label: ws.name }])} style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#2563EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563EB" }}>{ws.name}</Text>
                        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{ws.startTime} ~ {ws.endTime}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
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
  const activeEmployees = useMemo(() => allEmployees?.filter(e => e.isActive) ?? [], [allEmployees]);

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
          <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
            <Text style={{ fontSize: 20, color: "#2563EB" }}>›</Text>
          </TouchableOpacity>
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
type WorkShift = { id: number; name: string; startTime: string; endTime: string; isDefaultWeekday: boolean; isDefaultHoliday: boolean; isActive: boolean };
const INITIAL_FORM = { name: "", startTime: "09:00", endTime: "18:00", isDefaultWeekday: false, isDefaultHoliday: false };

function WorkShiftsTab() {
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<typeof INITIAL_FORM>(INITIAL_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<{ id: number; name: string } | null>(null);

  const { data: shifts, refetch, isLoading } = trpc.workShifts.list.useQuery();
  const createMutation = trpc.workShifts.create.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const updateMutation = trpc.workShifts.update.useMutation({ onSuccess: () => { refetch(); setShowModal(false); } });
  const deleteMutation = trpc.workShifts.delete.useMutation({ onSuccess: () => refetch() });

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
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", alignItems: "flex-end" }}>
        <TouchableOpacity onPress={openCreate} style={{ backgroundColor: "#2563EB", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>+ 新增班次</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={shifts ?? []}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
              <Text style={{ fontSize: 15, color: "#94A3B8" }}>尚未設定工作班次</Text>
              <Text style={{ fontSize: 13, color: "#CBD5E1", marginTop: 4 }}>請先新增班次，才能在週排班快速套用</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
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
          )}
        />
      )}

      {/* Modal */}
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
