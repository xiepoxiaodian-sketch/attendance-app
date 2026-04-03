import { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Modal, Platform,
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

// Download CSV on web, show share sheet on native
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
const STATUS_LABELS: Record<string, string> = {
  normal: "正常", late: "遲到", early_leave: "早退", absent: "缺勤",
};

// ─── Export Modal ────────────────────────────────────────────────────────────
type ExportType = "attendance_detail" | "attendance_summary" | "leave_records";

const EXPORT_OPTIONS: { type: ExportType; title: string; desc: string; icon: string }[] = [
  { type: "attendance_detail",  title: "打卡明細",   desc: "每筆打卡紀錄，含上下班時間、狀態、地點", icon: "🕐" },
  { type: "attendance_summary", title: "出勤統計",   desc: "每位員工本月出勤天數、遲到次數、請假天數", icon: "📊" },
  { type: "leave_records",      title: "請假紀錄",   desc: "已核准的請假申請，含假別、天數、備註",     icon: "📋" },
];

type ExportModalProps = {
  visible: boolean;
  onClose: () => void;
  year: number;
  month: number;
  attendanceRecords: AttendanceRecord[];
  employeeStats: EmployeeStat[];
  leaveRequests: LeaveRequest[];
};

function ExportModal({ visible, onClose, year, month, attendanceRecords, employeeStats, leaveRequests }: ExportModalProps) {
  const [selected, setSelected] = useState<ExportType>("attendance_detail");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const label = `${year}年${String(month).padStart(2, "0")}月`;
      if (selected === "attendance_detail") {
        const headers = ["日期", "員工姓名", "帳號", "上班時間", "下班時間", "班次", "狀態", "備註"];
        const rows = attendanceRecords.map(r => [
          fmtDate(r.date),
          r.employeeName ?? "",
          r.employeeUsername ?? "",
          fmtDateTime(r.clockInTime),
          fmtDateTime(r.clockOutTime),
          r.shiftLabel ?? "",
          STATUS_LABELS[r.status ?? ""] ?? r.status ?? "",
          r.note ?? "",
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
          l.employeeName ?? "",
          LEAVE_TYPE_LABELS[l.leaveType ?? ""] ?? l.leaveType ?? "",
          fmtDate(l.startDate),
          fmtDate(l.endDate),
          String(l.totalDays ?? ""),
          fmtDateTime(l.createdAt),
          l.reason ?? "",
        ]);
        await exportCsv(`請假紀錄_${label}.csv`, buildCsv(headers, rows));
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
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>匯出報表</Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{year} 年 {month} 月</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 18, color: "#64748B" }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={{ padding: 16, gap: 10 }}>
            {EXPORT_OPTIONS.map(opt => (
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

          {/* Row count hint */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📄</Text>
            <Text style={{ fontSize: 13, color: "#16A34A", flex: 1 }}>
              {selected === "attendance_detail" && `共 ${attendanceRecords.length} 筆打卡紀錄`}
              {selected === "attendance_summary" && `共 ${employeeStats.length} 位員工統計`}
              {selected === "leave_records" && `共 ${leaveRequests.length} 筆請假紀錄`}
              ，將匯出為 CSV 格式（Excel 可直接開啟）
            </Text>
          </View>

          {/* Export Button */}
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

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const { start, end } = getMonthRange(year, month);
  const { data: allEmployees } = trpc.employees.list.useQuery();
  const { data: attendanceRecords, refetch, isLoading } = trpc.attendance.getAll.useQuery({ startDate: start, endDate: end });
  const { data: leaveRequests } = trpc.leave.getAll.useQuery({ status: "approved" });

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

  // Filter leave requests to current month
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

  return (
    <ScreenContainer containerClassName="bg-[#F1F5F9]">
      <AdminHeader title="報表統計" subtitle={`${year} 年 ${month} 月`} onRefresh={onRefresh} refreshing={refreshing} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector + Export Button */}
        <View style={{ backgroundColor: "white", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#F1F5F9" }}>
          <TouchableOpacity onPress={prevMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 16, color: "#475569" }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>{year} 年 {month} 月</Text>
          <TouchableOpacity onPress={nextMonth} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 16, color: "#475569" }}>›</Text>
          </TouchableOpacity>
        </View>

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

      {/* Export Modal */}
      <ExportModal
        visible={showExport}
        onClose={() => setShowExport(false)}
        year={year}
        month={month}
        attendanceRecords={records}
        employeeStats={employeeStats}
        leaveRequests={monthLeaves}
      />
    </ScreenContainer>
  );
}
