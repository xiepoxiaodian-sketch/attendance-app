import { useState, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Modal, Platform, FlatList,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AdminHeader } from "@/components/admin-header";
import { trpc } from "@/lib/trpc";

// ─── helpers ────────────────────────────────────────────────────────────────
function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
function fmtDateTime(val: unknown): string {
  if (!val) return "";
  try {
    const d = new Date(val as string);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return String(val); }
}
function fmtDate(val: unknown): string {
  if (!val) return "";
  try {
    const d = new Date(val as string);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return String(val); }
}
function fmtTime(val: unknown): string {
  if (!val) return "--:--";
  try {
    const d = new Date(val as string);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "--:--"; }
}
function fmtMinutes(mins: number): string {
  if (mins <= 0) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
function escapeCsv(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  return lines.join("\n");
}
async function exportCsv(filename: string, csv: string) {
  if (Platform.OS === "web") {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const path = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, "\uFEFF" + csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
      } else {
        Alert.alert("無法分享", "此裝置不支援檔案分享功能");
      }
    } catch (e) {
      Alert.alert("匯出失敗", String(e));
    }
  }
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "特休", sick: "病假", personal: "事假",
  marriage: "婚假", bereavement: "喪假", official: "公假", other: "其他",
};
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  normal:        { label: "正常",     color: "#16A34A", bg: "#DCFCE7" },
  late:          { label: "遲到",     color: "#D97706", bg: "#FEF3C7" },
  early_leave:   { label: "早退",     color: "#EA580C", bg: "#FFF7ED" },
  late_and_early:{ label: "遲到+早退",color: "#DC2626", bg: "#FEE2E2" },
  absent:        { label: "缺勤",     color: "#DC2626", bg: "#FEE2E2" },
};

// ─── Types ───────────────────────────────────────────────────────────────────
type AttendanceRecord = {
  id: number; employeeId: number; date: unknown; clockInTime: unknown; clockOutTime: unknown;
  shiftLabel?: string | null; status?: string | null; note?: string | null;
  employeeName?: string | null; employeeUsername?: string | null;
};
type LeaveRequest = {
  id: number; employeeId: number; leaveType?: string | null; startDate: unknown; endDate: unknown;
  totalDays?: number | null; reason?: string | null; createdAt?: unknown;
  employeeName?: string | null; status?: string | null;
};
type EmployeeStat = {
  id: number; name: string; jobTitle: string;
  presentDays: number; lateDays: number; absentDays: number; leaveDays: number;
};

type SalaryShift = {
  id: number;
  shiftLabel: string;
  clockInTime: unknown;
  clockOutTime: unknown;
  status: string;
  workMinutes: number;
};
type SalaryDailyRecord = {
  dateKey: string;
  shifts: SalaryShift[];
  totalWorkMinutes: number;
  hasLate: boolean;
  hasEarlyLeave: boolean;
  hasAbsent: boolean;
};
type SalaryEmployee = {
  employeeId: number;
  employeeName: string;
  employeeUsername: string;
  jobTitle: string;
  employeeType: string;
  totalWorkMinutes: number;
  totalWorkHours: number;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  scheduledLeaveDays: number;
  leaveDays: number;
  dailyRecords: SalaryDailyRecord[];
};

// ─── Employee Picker Modal ────────────────────────────────────────────────────
type EmployeePickerProps = {
  visible: boolean;
  onClose: () => void;
  employees: Array<{ id: number; fullName: string; jobTitle?: string | null }>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};
function EmployeePicker({ visible, onClose, employees, selectedId, onSelect }: EmployeePickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: 32 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>選擇員工</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 18, color: "#64748B" }}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {/* 全部員工 */}
            <TouchableOpacity
              onPress={() => { onSelect(null); onClose(); }}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F8FAFC", backgroundColor: selectedId === null ? "#EFF6FF" : "white" }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Text style={{ fontSize: 18 }}>👥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: selectedId === null ? "#2563EB" : "#1E293B" }}>全部員工</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>顯示所有員工的薪資統計</Text>
              </View>
              {selectedId === null && <Text style={{ color: "#2563EB", fontSize: 18 }}>✓</Text>}
            </TouchableOpacity>
            {employees.map(emp => (
              <TouchableOpacity
                key={emp.id}
                onPress={() => { onSelect(emp.id); onClose(); }}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F8FAFC", backgroundColor: selectedId === emp.id ? "#EFF6FF" : "white" }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#475569" }}>{emp.fullName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: selectedId === emp.id ? "#2563EB" : "#1E293B" }}>{emp.fullName}</Text>
                  {emp.jobTitle && <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>{emp.jobTitle}</Text>}
                </View>
                {selectedId === emp.id && <Text style={{ color: "#2563EB", fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Daily Records Detail Modal ───────────────────────────────────────────────
type DailyDetailModalProps = {
  visible: boolean;
  onClose: () => void;
  employee: SalaryEmployee | null;
  year: number;
  month: number;
};
function DailyDetailModal({ visible, onClose, employee, year, month }: DailyDetailModalProps) {
  if (!employee) return null;
  const label = `${year}年${String(month).padStart(2, "0")}月`;

  const handleExport = async () => {
    const headers = ["日期", "班次", "上班時間", "下班時間", "工作時數", "狀態"];
    const rows: string[][] = [];
    for (const day of employee.dailyRecords) {
      for (const shift of day.shifts) {
        const st = STATUS_LABELS[shift.status] ?? { label: shift.status };
        rows.push([
          day.dateKey,
          shift.shiftLabel,
          fmtTime(shift.clockInTime),
          fmtTime(shift.clockOutTime),
          fmtMinutes(shift.workMinutes),
          st.label,
        ]);
      }
    }
    await exportCsv(`${employee.employeeName}_打卡明細_${label}.csv`, buildCsv(headers, rows));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", paddingBottom: 32 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>{employee.employeeName} 打卡明細</Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{label} · 共 {employee.dailyRecords.length} 天</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={handleExport} style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "700" }}>⬇ 匯出</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 18, color: "#64748B" }}>×</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Summary Row */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            {[
              { label: "出勤", value: `${employee.presentDays}天`, color: "#16A34A" },
              { label: "時數", value: `${employee.totalWorkHours}h`, color: "#2563EB" },
              { label: "遲到", value: `${employee.lateDays}次`, color: "#D97706" },
              { label: "早退", value: `${employee.earlyLeaveDays}次`, color: "#EA580C" },
              { label: "請假", value: `${employee.leaveDays}天`, color: "#7C3AED" },
            ].map(item => (
              <View key={item.label} style={{ flex: 1, backgroundColor: "#F8FAFC", borderRadius: 8, padding: 8, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: item.color }}>{item.value}</Text>
                <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Daily List */}
          <FlatList
            data={employee.dailyRecords}
            keyExtractor={item => item.dateKey}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
            renderItem={({ item: day }) => {
              const dateObj = new Date(day.dateKey + "T00:00:00");
              const weekday = ["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()];
              return (
                <View style={{ marginBottom: 10, backgroundColor: "#F8FAFC", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E2E8F0" }}>
                  {/* Date Header */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F1F5F9" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B" }}>
                      {day.dateKey.slice(5)} (週{weekday})
                    </Text>
                    <Text style={{ fontSize: 12, color: "#475569", fontWeight: "600" }}>
                      {fmtMinutes(day.totalWorkMinutes)}
                    </Text>
                  </View>
                  {/* Shifts */}
                  {day.shifts.map((shift, idx) => {
                    const st = STATUS_LABELS[shift.status] ?? { label: shift.status, color: "#64748B", bg: "#F1F5F9" };
                    return (
                      <View key={shift.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#E2E8F0", gap: 8 }}>
                        {/* Shift label */}
                        <View style={{ backgroundColor: "#E0F2FE", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, minWidth: 52, alignItems: "center" }}>
                          <Text style={{ fontSize: 11, color: "#0369A1", fontWeight: "600" }}>{shift.shiftLabel}</Text>
                        </View>
                        {/* Times */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: "#1E293B", fontWeight: "500" }}>
                            {shift.clockInTime ? fmtTime(shift.clockInTime) : "--:--"}
                            <Text style={{ color: "#94A3B8" }}> → </Text>
                            {shift.clockOutTime ? fmtTime(shift.clockOutTime) : "--:--"}
                          </Text>
                          <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{fmtMinutes(shift.workMinutes)}</Text>
                        </View>
                        {/* Status badge */}
                        <View style={{ backgroundColor: st.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 11, color: st.color, fontWeight: "700" }}>{st.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 32, alignItems: "center" }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
                <Text style={{ color: "#94A3B8", fontSize: 14 }}>本月無打卡紀錄</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Export Modal ────────────────────────────────────────────────────────────
type ExportType = "attendance_detail" | "attendance_summary" | "leave_records" | "salary_summary" | "salary_detail";
const EXPORT_OPTIONS_REPORT: { type: ExportType; title: string; desc: string; icon: string }[] = [
  { type: "attendance_detail",  title: "打卡明細",   desc: "每筆打卡紀錄，含上下班時間、狀態、地點", icon: "🕐" },
  { type: "attendance_summary", title: "出勤統計",   desc: "每位員工本月出勤天數、遲到次數、請假天數", icon: "📊" },
  { type: "leave_records",      title: "請假紀錄",   desc: "已核准的請假申請，含假別、天數、備註",     icon: "📋" },
];
const EXPORT_OPTIONS_SALARY: { type: ExportType; title: string; desc: string; icon: string }[] = [
  { type: "salary_summary", title: "薪資統計總表", desc: "每位員工出勤時數、遲到早退次數、請假天數", icon: "💰" },
  { type: "salary_detail",  title: "薪資打卡明細", desc: "每筆打卡記錄，含班次、時間、工時、狀態",   icon: "🕐" },
];

type ExportModalProps = {
  visible: boolean;
  onClose: () => void;
  year: number;
  month: number;
  attendanceRecords: AttendanceRecord[];
  employeeStats: EmployeeStat[];
  leaveRequests: LeaveRequest[];
  salaryData: SalaryEmployee[];
  tab: "report" | "salary";
};
function ExportModal({ visible, onClose, year, month, attendanceRecords, employeeStats, leaveRequests, salaryData, tab }: ExportModalProps) {
  const defaultType: ExportType = tab === "salary" ? "salary_summary" : "attendance_detail";
  const [selected, setSelected] = useState<ExportType>(defaultType);
  const [exporting, setExporting] = useState(false);
  const options = tab === "salary" ? EXPORT_OPTIONS_SALARY : EXPORT_OPTIONS_REPORT;

  const handleExport = async () => {
    setExporting(true);
    try {
      const label = `${year}年${String(month).padStart(2, "0")}月`;
      if (selected === "attendance_detail") {
        const headers = ["日期", "員工姓名", "帳號", "上班時間", "下班時間", "班次", "狀態", "備註"];
        const rows = attendanceRecords.map(r => [
          fmtDate(r.date), r.employeeName ?? "", r.employeeUsername ?? "",
          fmtDateTime(r.clockInTime), fmtDateTime(r.clockOutTime),
          r.shiftLabel ?? "", STATUS_LABELS[r.status ?? ""]?.label ?? r.status ?? "", r.note ?? "",
        ]);
        await exportCsv(`打卡明細_${label}.csv`, buildCsv(headers, rows));
      } else if (selected === "attendance_summary") {
        const headers = ["員工姓名", "職稱", "出勤天數", "遲到次數", "請假天數"];
        const rows = employeeStats.map(e => [
          e.name, e.jobTitle, String(e.presentDays), String(e.lateDays), String(e.leaveDays),
        ]);
        await exportCsv(`出勤統計_${label}.csv`, buildCsv(headers, rows));
      } else if (selected === "leave_records") {
        const headers = ["員工姓名", "假別", "開始日期", "結束日期", "天數", "申請時間", "備註"];
        const rows = leaveRequests.map(l => [
          l.employeeName ?? "", LEAVE_TYPE_LABELS[l.leaveType ?? ""] ?? l.leaveType ?? "",
          fmtDate(l.startDate), fmtDate(l.endDate), String(l.totalDays ?? ""),
          fmtDateTime(l.createdAt), l.reason ?? "",
        ]);
        await exportCsv(`請假紀錄_${label}.csv`, buildCsv(headers, rows));
      } else if (selected === "salary_summary") {
        const headers = ["員工姓名", "帳號", "職稱", "員工類型", "出勤天數", "總工時(h)", "遲到次數", "早退次數", "缺勤天數", "排班休假天數", "請假天數"];
        const rows = salaryData.map(e => [
          e.employeeName, e.employeeUsername, e.jobTitle,
          e.employeeType === "full_time" ? "全職" : "兼職",
          String(e.presentDays), String(e.totalWorkHours),
          String(e.lateDays), String(e.earlyLeaveDays), String(e.absentDays),
          String(e.scheduledLeaveDays), String(e.leaveDays),
        ]);
        await exportCsv(`薪資統計_${label}.csv`, buildCsv(headers, rows));
      } else if (selected === "salary_detail") {
        const headers = ["員工姓名", "日期", "班次", "上班時間", "下班時間", "工時(分鐘)", "工時", "狀態"];
        const rows: string[][] = [];
        for (const emp of salaryData) {
          for (const day of emp.dailyRecords) {
            for (const shift of day.shifts) {
              const st = STATUS_LABELS[shift.status] ?? { label: shift.status };
              rows.push([
                emp.employeeName, day.dateKey, shift.shiftLabel,
                fmtTime(shift.clockInTime), fmtTime(shift.clockOutTime),
                String(shift.workMinutes), fmtMinutes(shift.workMinutes), st.label,
              ]);
            }
          }
        }
        await exportCsv(`薪資打卡明細_${label}.csv`, buildCsv(headers, rows));
      }
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>匯出報表</Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{year} 年 {month} 月</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 18, color: "#64748B" }}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            {options.map(opt => (
              <TouchableOpacity
                key={opt.type}
                onPress={() => setSelected(opt.type)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12,
                  backgroundColor: selected === opt.type ? "#EFF6FF" : "#F8FAFC",
                  borderWidth: 1.5, borderColor: selected === opt.type ? "#2563EB" : "#E2E8F0",
                }}
              >
                <Text style={{ fontSize: 28 }}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: selected === opt.type ? "#2563EB" : "#1E293B" }}>{opt.title}</Text>
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{opt.desc}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected === opt.type ? "#2563EB" : "#CBD5E1", alignItems: "center", justifyContent: "center", backgroundColor: selected === opt.type ? "#2563EB" : "transparent" }}>
                  {selected === opt.type && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "white" }} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={handleExport}
              disabled={exporting}
              style={{ backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Text style={{ fontSize: 20 }}>⬇️</Text>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>匯出 CSV</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Salary Tab ───────────────────────────────────────────────────────────────
type SalaryTabProps = {
  year: number;
  month: number;
  onExport: () => void;
  allEmployees: Array<{ id: number; fullName: string; jobTitle?: string | null }>;
};
function SalaryTab({ year, month, onExport, allEmployees }: SalaryTabProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<SalaryEmployee | null>(null);

  const { data: salaryData, isLoading, refetch } = trpc.attendance.getMonthlySalary.useQuery({
    year, month, employeeId: selectedEmployeeId ?? undefined,
  });

  const employees = (salaryData ?? []) as SalaryEmployee[];
  const selectedEmpName = selectedEmployeeId
    ? allEmployees.find(e => e.id === selectedEmployeeId)?.fullName ?? "員工"
    : "全部員工";

  return (
    <View style={{ flex: 1 }}>
      {/* Filter Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "white", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}
        >
          <Text style={{ fontSize: 16 }}>👤</Text>
          <Text style={{ flex: 1, fontSize: 14, color: "#1E293B", fontWeight: "600" }}>{selectedEmpName}</Text>
          <Text style={{ fontSize: 14, color: "#94A3B8" }}>▾</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onExport}
          style={{ backgroundColor: "#1E3A8A", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text style={{ fontSize: 14 }}>⬇️</Text>
          <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>匯出</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Stats */}
      {employees.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 10 }}>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#2563EB" }}>
              {employees.reduce((s, e) => s + e.presentDays, 0)}
            </Text>
            <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>出勤天次</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#16A34A" }}>
              {employees.reduce((s, e) => s + e.totalWorkHours, 0).toFixed(1)}h
            </Text>
            <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>總工時</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#D97706" }}>
              {employees.reduce((s, e) => s + e.lateDays, 0)}
            </Text>
            <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>遲到次數</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "white", borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#7C3AED" }}>
              {employees.reduce((s, e) => s + e.leaveDays, 0)}
            </Text>
            <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>請假天數</Text>
          </View>
        </View>
      )}

      {/* Employee List */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={{ color: "#94A3B8", marginTop: 12, fontSize: 14 }}>載入薪資資料...</Text>
        </View>
      ) : employees.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
          <Text style={{ color: "#94A3B8", fontSize: 15 }}>本月無出勤資料</Text>
        </View>
      ) : (
        <FlatList
          data={employees}
          keyExtractor={item => String(item.employeeId)}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: emp }) => (
            <TouchableOpacity
              onPress={() => setDetailEmployee(emp)}
              style={{ backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}
            >
              {/* Employee Header */}
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#2563EB" }}>{emp.employeeName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{emp.employeeName}</Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>
                    {emp.jobTitle} · {emp.employeeType === "full_time" ? "全職" : "兼職"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#2563EB" }}>{emp.totalWorkHours}h</Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>總工時</Text>
                </View>
              </View>
              {/* Stats Grid */}
              <View style={{ flexDirection: "row", paddingVertical: 10 }}>
                {[
                  { label: "出勤", value: `${emp.presentDays}天`, color: "#16A34A" },
                  { label: "遲到", value: `${emp.lateDays}次`, color: emp.lateDays > 0 ? "#D97706" : "#CBD5E1" },
                  { label: "早退", value: `${emp.earlyLeaveDays}次`, color: emp.earlyLeaveDays > 0 ? "#EA580C" : "#CBD5E1" },
                  { label: "缺勤", value: `${emp.absentDays}天`, color: emp.absentDays > 0 ? "#DC2626" : "#CBD5E1" },
                  { label: "休假", value: `${emp.scheduledLeaveDays}天`, color: "#0891B2" },
                  { label: "請假", value: `${emp.leaveDays}天`, color: emp.leaveDays > 0 ? "#7C3AED" : "#CBD5E1" },
                ].map(item => (
                  <View key={item.label} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: item.color }}>{item.value}</Text>
                    <Text style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>{item.label}</Text>
                  </View>
                ))}
              </View>
              {/* Tap hint */}
              <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "right" }}>點擊查看打卡明細 ›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <EmployeePicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        employees={allEmployees}
        selectedId={selectedEmployeeId}
        onSelect={setSelectedEmployeeId}
      />
      <DailyDetailModal
        visible={!!detailEmployee}
        onClose={() => setDetailEmployee(null)}
        employee={detailEmployee}
        year={year}
        month={month}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "salary">("report");

  const { start, end } = getMonthRange(year, month);
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: attendanceRecords, refetch, isLoading } = trpc.attendance.getAll.useQuery({ startDate: start, endDate: end });
  const { data: leaveRequests } = trpc.leave.getAll.useQuery({ status: "approved" });
  const { data: salaryData } = trpc.attendance.getMonthlySalary.useQuery({ year, month });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const activeEmployees = allEmployees?.filter(e => e.isActive) ?? [];
  const records = (attendanceRecords ?? []) as AttendanceRecord[];
  const leaves = (leaveRequests ?? []) as LeaveRequest[];

  const monthLeaves = leaves.filter(l => {
    const lStart = new Date(l.startDate as string);
    const lEnd = new Date(l.endDate as string);
    const mStart = new Date(start);
    const mEnd = new Date(end);
    return lStart <= mEnd && lEnd >= mStart;
  });

  const employeeStats: EmployeeStat[] = activeEmployees.map(emp => {
    const empRecords = records.filter(r => r.employeeId === emp.id);
    const presentDays = empRecords.filter(r => r.clockInTime).length;
    const lateDays = empRecords.filter(r => r.status === "late").length;
    const absentDays = empRecords.filter(r => !r.clockInTime).length;
    const empLeave = monthLeaves.filter(l => l.employeeId === emp.id);
    return {
      id: emp.id, name: emp.fullName, jobTitle: emp.jobTitle ?? emp.role,
      presentDays, lateDays, absentDays, leaveDays: empLeave.length,
    };
  });

  const totalPresent = records.filter(r => r.clockInTime).length;
  const totalLate = records.filter(r => r.status === "late").length;
  const totalLeave = monthLeaves.length;
  const salaryEmployees = (salaryData ?? []) as SalaryEmployee[];

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="報表統計" subtitle={`${year} 年 ${month} 月`} onRefresh={onRefresh} refreshing={refreshing} />

      {/* Month Selector */}
      <View style={{ backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
        <TouchableOpacity onPress={prevMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: "#475569" }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>{year} 年 {month} 月</Text>
        <TouchableOpacity onPress={nextMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: "#475569" }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={{ flexDirection: "row", backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        {([
          { key: "report", label: "📊 報表統計" },
          { key: "salary", label: "💰 薪資計算" },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === tab.key ? "#2563EB" : "transparent" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: activeTab === tab.key ? "#2563EB" : "#94A3B8" }}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === "salary" ? (
        <SalaryTab
          year={year}
          month={month}
          onExport={() => setShowExport(true)}
          allEmployees={activeEmployees.map(e => ({ id: e.id, fullName: e.fullName, jobTitle: e.jobTitle }))}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Export Banner */}
          <TouchableOpacity
            onPress={() => setShowExport(true)}
            style={{ backgroundColor: "#1E3A8A", borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
          >
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>📥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "white" }}>匯出報表</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>打卡明細 · 出勤統計 · 請假紀錄 → CSV</Text>
            </View>
            <View style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 }}>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>匯出</Text>
            </View>
          </TouchableOpacity>

          {/* Summary Cards */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9", alignItems: "center" }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#2563EB" }}>{activeEmployees.length}</Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, textAlign: "center" }}>在職員工</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9", alignItems: "center" }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#16A34A" }}>{totalPresent}</Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, textAlign: "center" }}>出勤次數</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9", alignItems: "center" }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#D97706" }}>{totalLate}</Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, textAlign: "center" }}>遲到次數</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#F1F5F9", alignItems: "center" }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#7C3AED" }}>{totalLeave}</Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, textAlign: "center" }}>請假件數</Text>
            </View>
          </View>

          {/* Employee Table */}
          <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9", overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B" }}>員工出勤統計</Text>
              <TouchableOpacity onPress={() => setShowExport(true)} style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "600" }}>⬇ 匯出</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: "600", color: "#64748B" }}>員工</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: "#64748B", textAlign: "center" }}>出勤</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: "#64748B", textAlign: "center" }}>遲到</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: "#64748B", textAlign: "center" }}>請假</Text>
            </View>
            {isLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#2563EB" />
              </View>
            ) : employeeStats.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#94A3B8", fontSize: 14 }}>無員工資料</Text>
              </View>
            ) : (
              employeeStats.map((emp, idx) => (
                <View key={emp.id} style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: idx < employeeStats.length - 1 ? 1 : 0, borderBottomColor: "#F1F5F9", alignItems: "center" }}>
                  <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563EB" }}>{emp.name[0]}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#1E293B" }}>{emp.name}</Text>
                      <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{emp.jobTitle}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#16A34A" }}>{emp.presentDays}</Text>
                    <Text style={{ fontSize: 9, color: "#94A3B8" }}>天</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: emp.lateDays > 0 ? "#D97706" : "#CBD5E1" }}>{emp.lateDays}</Text>
                    <Text style={{ fontSize: 9, color: "#94A3B8" }}>次</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: emp.leaveDays > 0 ? "#7C3AED" : "#CBD5E1" }}>{emp.leaveDays}</Text>
                    <Text style={{ fontSize: 9, color: "#94A3B8" }}>天</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Leave Summary */}
          {monthLeaves.length > 0 && (
            <View style={{ backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9", overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B" }}>本月請假紀錄</Text>
                <TouchableOpacity onPress={() => setShowExport(true)} style={{ backgroundColor: "#F5F3FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 12, color: "#7C3AED", fontWeight: "600" }}>⬇ 匯出</Text>
                </TouchableOpacity>
              </View>
              {monthLeaves.slice(0, 8).map((l, i) => {
                const leaveLabel = LEAVE_TYPE_LABELS[l.leaveType ?? ""] ?? l.leaveType ?? "其他";
                const leaveColors: Record<string, { color: string; bg: string }> = {
                  特休: { color: "#2563EB", bg: "#EFF6FF" }, 病假: { color: "#DC2626", bg: "#FEF2F2" },
                  事假: { color: "#D97706", bg: "#FFFBEB" }, 婚假: { color: "#7C3AED", bg: "#F5F3FF" },
                  喪假: { color: "#475569", bg: "#F8FAFC" }, 公假: { color: "#0891B2", bg: "#ECFEFF" }, 其他: { color: "#64748B", bg: "#F1F5F9" },
                };
                const lc = leaveColors[leaveLabel] ?? { color: "#64748B", bg: "#F1F5F9" };
                return (
                  <View key={l.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < Math.min(monthLeaves.length, 8) - 1 ? 1 : 0, borderBottomColor: "#F8FAFC", gap: 10 }}>
                    <View style={{ backgroundColor: lc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 40, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: lc.color, fontWeight: "700" }}>{leaveLabel}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#1E293B" }}>{l.employeeName ?? `員工 #${l.employeeId}`}</Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{fmtDate(l.startDate)} ~ {fmtDate(l.endDate)}</Text>
                    </View>
                    <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: "#16A34A", fontWeight: "600" }}>{l.totalDays ?? "?"} 天</Text>
                    </View>
                  </View>
                );
              })}
              {monthLeaves.length > 8 && (
                <View style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>還有 {monthLeaves.length - 8} 筆，請匯出查看完整資料</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Export Modal */}
      <ExportModal
        visible={showExport}
        onClose={() => setShowExport(false)}
        year={year}
        month={month}
        attendanceRecords={records}
        employeeStats={employeeStats}
        leaveRequests={monthLeaves}
        salaryData={salaryEmployees}
        tab={activeTab}
      />
    </ScreenContainer>
  );
}
